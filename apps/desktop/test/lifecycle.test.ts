import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { MessageBoxOptions } from "electron";
import { _electron, type ElectronApplication } from "playwright";
import { expect, test } from "vitest";
import { isRunning, mainPid, serverChildren, serverPid } from "./support/desktop-processes.js";

const output = fileURLToPath(new URL("../dist/package", import.meta.url));
const executable =
  process.platform === "win32"
    ? join(output, "win-unpacked", "task-tracker.exe")
    : join(output, "linux-unpacked", "task-tracker");

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

function launch(desktop: DesktopFixture) {
  return _electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${desktop.profile}`],
    env: { ...process.env, TASKTRACKER_DB_PATH: desktop.database },
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
      expect(new URL(page.url()).protocol).toBe("data:");
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
        return { menu: Menu.getApplicationMenu(), devTools: contents?.isDevToolsOpened() };
      });

      expect(state).toEqual({ menu: null, devTools: false });
    } finally {
      await application.close();
    }
  },
);

/** Finds Electron main processes for `profile` other than `excluded`. */
function otherMainProcesses(profile: string, excluded: number) {
  return execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.includes(`--user-data-dir=${profile}`) && !line.includes("--type="))
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid !== excluded);
}

async function runSecondInstance(desktop: DesktopFixture) {
  const secondInstance = spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: { ...process.env, TASKTRACKER_DB_PATH: desktop.database },
    stdio: "ignore",
  });
  return once(secondInstance, "exit");
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
      process.kill(server, "SIGSTOP");
      const exited = once(application.process(), "exit");
      await application.evaluate(({ app }) => app.quit());

      expect(await runSecondInstance(desktop)).toEqual([0, null]);
      process.kill(server, "SIGCONT");
      await exited;

      await expect
        .poll(() => otherMainProcesses(desktop.profile, original), { timeout: 15_000 })
        .toHaveLength(1);
      relaunched = otherMainProcesses(desktop.profile, original)[0] ?? 0;
      const launchedPid = relaunched;
      await expect.poll(() => serverChildren(launchedPid), { timeout: 15_000 }).toHaveLength(1);
    } finally {
      if (isRunning(server)) {
        process.kill(server, "SIGCONT");
      }
      if (relaunched !== undefined) {
        process.kill(relaunched, "SIGTERM");
        const stopped = relaunched;
        await expect.poll(() => isRunning(stopped), { timeout: 15_000 }).toBe(false);
      }
      await application.close().catch(() => {});
    }
  },
);
