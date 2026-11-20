import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MessageBoxOptions } from "electron";
import { _electron, type ElectronApplication } from "playwright";
import { expect, test } from "vitest";
import { unpackedExecutable as executable } from "../scripts/package-paths.ts";
import {
  isRunning,
  mainPid,
  serverChildren,
  serverPid,
  signalIfRunning,
} from "./support/desktop-processes.js";
import { fakeAppImageInstall, recordedStart, recordingAppImage } from "./support/installed-app.js";

interface DesktopFixture {
  readonly database: string;
  readonly profile: string;
}

const desktopTest = test.extend<{ desktop: DesktopFixture }>({
  desktop: async ({ onTestFinished }, use) => {
    const temporary = await mkdtemp(join(tmpdir(), "task-tracker-lifecycle-"));
    onTestFinished(() => rm(temporary, { recursive: true, force: true, maxRetries: 5 }));
    const data = join(temporary, "data");
    await mkdir(data);
    await use({ database: join(data, "tasktracker.db"), profile: join(temporary, "profile") });
  },
});

function launch(
  desktop: DesktopFixture,
  args: readonly string[] = [],
  environment: NodeJS.ProcessEnv = {},
) {
  return _electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${desktop.profile}`, ...args],
    env: { ...process.env, ...environment, TASKTRACKER_DB_PATH: desktop.database },
    chromiumSandbox: true,
    timeout: 10_000,
  });
}

interface DialogState {
  messages: MessageBoxOptions[];
  respond?: (response: { response: number; checkboxChecked: boolean }) => void;
}
type ElectronTestGlobal = typeof globalThis & { desktopLifecycleDialog: DialogState };

async function observeDialogs(application: ElectronApplication) {
  // Native message boxes are outside Chromium's input automation, so record the
  // packaged dialog calls and substitute the button the user would press.
  await application.evaluate(({ dialog }) => {
    const state: DialogState = { messages: [] };
    (globalThis as ElectronTestGlobal).desktopLifecycleDialog = state;
    dialog.showMessageBox = (parentOrOptions, options?: MessageBoxOptions) => {
      state.messages.push(options ?? (parentOrOptions as MessageBoxOptions));
      return new Promise((resolve) => {
        state.respond = resolve;
      });
    };
  });
  return {
    read: () =>
      application.evaluate(
        () => (globalThis as ElectronTestGlobal).desktopLifecycleDialog.messages,
      ),
    press: (button: number) =>
      application.evaluate(
        (_electron, response) =>
          (globalThis as ElectronTestGlobal).desktopLifecycleDialog.respond?.({
            response,
            checkboxChecked: false,
          }),
        button,
      ),
  };
}

/** Writes a database with an unknown schema and holds a write lock so startup waits on it. */
function lockedUnrecognizedDatabase(path: string) {
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE Unexpected (Id INTEGER)");
  database.exec("BEGIN EXCLUSIVE");
  return database;
}

/** Reports whether the window's live renderer shows the empty home screen. */
function rendererShowsHome(application: ElectronApplication) {
  return application.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (contents === undefined || contents.isCrashed() || contents.isLoading()) {
      return false;
    }
    const found: unknown = await contents.executeJavaScript(
      `document.querySelector('[data-testid="empty-home-create"]') !== null`,
    );
    return found === true;
  });
}

/**
 * The window's URL as main sees it. Main shows its dialogs only after its own
 * navigation finished, while Playwright's `page.url()` follows a moment later.
 */
function rendererUrl(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getURL(),
  );
}

function windowCount(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

desktopTest(
  "Shows a startup failure when the first launch finds an unrecognized schema",
  async ({ desktop }) => {
    // The server's busy timeout holds startup on the lock until the dialog is observed.
    using lock = lockedUnrecognizedDatabase(desktop.database);
    const application = await launch(desktop);
    try {
      const dialogs = await observeDialogs(application);
      lock.exec("COMMIT");

      await expect.poll(dialogs.read, { timeout: 10_000 }).toMatchObject([
        {
          type: "error",
          title: "Task Tracker could not start",
          detail: expect.stringContaining("Unrecognized Task Tracker database schema"),
          buttons: ["Quit"],
        },
      ]);
      expect(await windowCount(application)).toBe(0);
      const exited = once(application.process(), "exit");
      await dialogs.press(0);
      await exited;
    } finally {
      await application.close().catch(() => {});
    }
  },
);

desktopTest(
  "Stops the server through the parent pipe when Electron main is killed",
  async ({ desktop }) => {
    const application = await launch(desktop);
    try {
      const page = await application.firstWindow({ timeout: 10_000 });
      await page.getByTestId("empty-home-create").waitFor();
      const server = await serverPid(application);

      process.kill(await mainPid(application), "SIGKILL");

      await expect.poll(() => isRunning(server), { timeout: 10_000 }).toBe(false);
    } finally {
      await application.close().catch(() => {});
    }
  },
);

desktopTest(
  "Replaces the renderer with a stopped page until the server restarts",
  async ({ desktop }) => {
    const application = await launch(desktop);
    try {
      const page = await application.firstWindow({ timeout: 10_000 });
      await page.getByTestId("empty-home-create").waitFor();
      const dialogs = await observeDialogs(application);

      process.kill(await serverPid(application), "SIGKILL");

      await expect.poll(dialogs.read).toMatchObject([{ buttons: ["Restart", "Quit"] }]);
      expect(new URL((await rendererUrl(application)) ?? "").protocol).toBe("data:");
      await page.getByRole("heading", { name: "The Task Tracker server stopped." }).waitFor();
      const reload = page.waitForEvent("load");
      await dialogs.press(0);
      await reload;
      expect(new URL(page.url()).protocol).toBe("tasktracker:");
      await page.getByTestId("empty-home-create").waitFor();
    } finally {
      await application.close();
    }
  },
);

desktopTest(
  "Offers to reload the window after the renderer process is gone",
  async ({ desktop }) => {
    const application = await launch(desktop);
    try {
      const page = await application.firstWindow({ timeout: 10_000 });
      await page.getByTestId("empty-home-create").waitFor();
      const dialogs = await observeDialogs(application);
      const server = await serverPid(application);

      await application.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
      });

      await expect
        .poll(dialogs.read, { timeout: 10_000 })
        .toMatchObject([{ type: "error", buttons: ["Reload", "Quit"] }]);
      await dialogs.press(0);

      // Playwright keeps a crashed page closed, so read the reloaded page from main.
      await expect.poll(() => rendererShowsHome(application), { timeout: 10_000 }).toBe(true);
      expect(await serverPid(application)).toBe(server);
    } finally {
      await application.close();
    }
  },
);

desktopTest(
  "Hides the default menu and developer tools in packaged builds",
  async ({ desktop }) => {
    const application = await launch(desktop);
    try {
      await application.firstWindow({ timeout: 10_000 });

      const state = await application.evaluate(({ BrowserWindow, Menu }) => {
        const contents = BrowserWindow.getAllWindows()[0]?.webContents;
        contents?.openDevTools();
        const roles = (items: ReadonlyArray<Electron.MenuItem>): Array<string> =>
          items.flatMap((item) => [
            ...(item.role === undefined ? [] : [item.role.toLowerCase()]),
            ...(item.submenu === undefined ? [] : roles(item.submenu.items)),
          ]);
        const menu = Menu.getApplicationMenu();
        return {
          menuRoles: menu === null ? null : roles(menu.items),
          devTools: contents?.isDevToolsOpened(),
        };
      });

      expect(state.devTools).toBe(false);
      if (process.platform !== "darwin") {
        expect(state.menuRoles).toBeNull();
        return;
      }
      // macOS keeps a menu for the system shortcuts, without reload, developer tools,
      // or native undo that would take Cmd+Z from the app's history.
      const menuRoles = state.menuRoles ?? [];
      expect(menuRoles).toEqual(expect.arrayContaining(["quit", "cut", "copy", "paste"]));
      const blocked = ["undo", "redo", "reload", "forcereload", "toggledevtools"];
      expect(menuRoles.filter((role) => blocked.includes(role))).toEqual([]);
    } finally {
      await application.close();
    }
  },
);

/**
 * Finds Electron main processes for `profile` other than `excluded`. Matching the
 * executable skips the shell that waits to start the relaunched app.
 */
function otherMainProcesses(profile: string, excluded: number) {
  return execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" })
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
    .filter((match) => match !== null)
    .filter(([, , command = ""]) => isMainProcessFor(command, profile))
    .map(([, pid = ""]) => Number.parseInt(pid, 10))
    .filter((pid) => pid !== excluded);
}

function isMainProcessFor(command: string, profile: string) {
  return (
    command.startsWith(`${executable} `) &&
    command.includes(`--user-data-dir=${profile}`) &&
    !command.includes("--type=")
  );
}

async function runSecondInstance(desktop: DesktopFixture) {
  const secondInstance = spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: { ...process.env, TASKTRACKER_DB_PATH: desktop.database },
    stdio: "ignore",
  });
  return once(secondInstance, "exit");
}

/**
 * Reads whether the kernel's no-new-privileges flag is set for the PID. With it
 * set, the setuid `chrome-sandbox` helper cannot gain root, so Chromium cannot
 * start where the user-namespace sandbox is unavailable, as on GitHub's Ubuntu.
 */
async function hasNoNewPrivileges(pid: number) {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  return /^NoNewPrivs:\s*1$/m.test(status);
}

/**
 * Quits with the server stopped mid-shutdown, starts a second instance during
 * that window and waits for the quitting instance to exit.
 */
async function quitWhileAnotherInstanceStarts(
  application: ElectronApplication,
  desktop: DesktopFixture,
  server: number,
) {
  process.kill(server, "SIGSTOP");
  const exited = once(application.process(), "exit");
  await application.evaluate(({ app }) => app.quit());

  expect(await runSecondInstance(desktop)).toEqual([0, null]);
  process.kill(server, "SIGCONT");
  await exited;
}

// Holding the stop open needs SIGSTOP, which Windows does not provide.
desktopTest.skipIf(process.platform === "win32")(
  "Relaunches when a second instance starts while the app is quitting",
  async ({ desktop }) => {
    const application = await launch(desktop);
    const original = await mainPid(application);
    const page = await application.firstWindow({ timeout: 10_000 });
    await page.getByTestId("empty-home-create").waitFor();
    const server = await serverPid(application);
    let relaunched: number | undefined;
    try {
      await quitWhileAnotherInstanceStarts(application, desktop, server);

      let found: number[] = [];
      await expect
        .poll(() => (found = otherMainProcesses(desktop.profile, original)), { timeout: 15_000 })
        .toHaveLength(1);
      const [launchedPid = Number.NaN] = found;
      relaunched = launchedPid;
      if (process.platform === "linux") {
        expect(await hasNoNewPrivileges(launchedPid)).toBe(false);
      }
      await expect.poll(() => serverChildren(launchedPid), { timeout: 15_000 }).toHaveLength(1);
      process.kill(launchedPid, "SIGTERM");
      await expect.poll(() => isRunning(launchedPid), { timeout: 15_000 }).toBe(false);
    } finally {
      // Best-effort cleanup that never throws, so the assertion that failed is the one reported.
      signalIfRunning(server, "SIGCONT");
      if (relaunched !== undefined) {
        signalIfRunning(relaunched, "SIGKILL");
      }
      await application.close().catch(() => {});
    }
  },
);

// The AppImage's temporary mount goes away when the app exits, so the relaunch must start
// the AppImage file. The packaged smoke runs the unpacked app with a stand-in AppImage.
desktopTest.runIf(process.platform === "linux")(
  "Relaunches the AppImage file when a second instance starts while an AppImage build is quitting",
  async ({ desktop }) => {
    const install = await fakeAppImageInstall(desktop);
    const marker = join(install.folder, "relaunched.txt");
    await writeFile(install.appImage, recordingAppImage(marker), { mode: 0o755 });
    const application = await launch(desktop, [], install.environment);
    const page = await application.firstWindow({ timeout: 10_000 });
    await page.getByTestId("empty-home-create").waitFor();
    const server = await serverPid(application);
    try {
      await quitWhileAnotherInstanceStarts(application, desktop, server);

      await expect.poll(() => recordedStart(marker), { timeout: 15_000 }).toBeDefined();
      const [privileges, appDirectory, ...args] = (await recordedStart(marker)) ?? [];
      expect([privileges, appDirectory]).toEqual(["NoNewPrivs:\t0", "APPDIR=unset"]);
      expect(args).toContain(`--user-data-dir=${desktop.profile}`);
    } finally {
      signalIfRunning(server, "SIGCONT");
      await application.close().catch(() => {});
    }
  },
);
