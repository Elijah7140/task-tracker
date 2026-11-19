import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, copyFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { MessageBoxOptions } from "electron";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { expect, test } from "vitest";

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
    const temporary = await mkdtemp(join(tmpdir(), "task-tracker-desktop-"));
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

function serverPid(application: ElectronApplication) {
  const parent = application.process().pid;
  const children =
    process.platform === "win32"
      ? execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${parent}' | Where-Object { $_.CommandLine -match 'server[.]mjs' } | Select-Object -ExpandProperty ProcessId`,
          ],
          { encoding: "utf8" },
        )
      : execFileSync("ps", ["-o", "pid=,args=", "--ppid", String(parent)], { encoding: "utf8" })
          .split("\n")
          .filter((line) => line.includes("server.mjs"))
          .join("\n");
  const pid = Number.parseInt(children.trim(), 10);
  if (!Number.isInteger(pid)) {
    throw new Error("Could not find the running RPC server.");
  }
  return pid;
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

/** Starts another instance against the same profile and returns its exit code and signal. */
async function runSecondInstance(desktop: DesktopFixture) {
  const secondInstance = spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: { ...process.env, TASKTRACKER_DB_PATH: desktop.database },
    stdio: "ignore",
  });
  try {
    return await once(secondInstance, "exit");
  } finally {
    if (secondInstance.exitCode === null) {
      secondInstance.kill();
    }
  }
}

function nodeGlobals(page: Page) {
  return page.evaluate(() => ({ require: "require" in window, process: "process" in window }));
}

function rendererSandboxed(application: ElectronApplication) {
  return application.evaluate(({ app, BrowserWindow }) => {
    const pid = BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId();
    return app.getAppMetrics().find((metric) => metric.pid === pid)?.sandboxed;
  });
}

desktopTest(
  "Starts one sandboxed instance and persists a project after clean shutdown",
  async ({ desktop }) => {
    const application = await launch(desktop);
    let child: number;
    try {
      const page = await application.firstWindow({ timeout: 10_000 });

      await page.getByTestId("empty-home-create").click();
      await page.keyboard.type("Packaged project");
      await page.keyboard.press("Enter");
      await page.getByRole("article", { name: "Packaged project" }).waitFor();
      child = serverPid(application);

      expect(await runSecondInstance(desktop)).toEqual([0, null]);
      expect(serverPid(application)).toBe(child);
      expect(new URL(page.url()).search).toBe("");
      expect(await nodeGlobals(page)).toEqual({ require: false, process: false });
      if (process.platform === "win32") {
        expect(await rendererSandboxed(application)).toBe(true);
      }
    } finally {
      await application.close();
    }
    expect(isRunning(child)).toBe(false);

    const reopened = await launch(desktop);
    try {
      const page = await reopened.firstWindow({ timeout: 10_000 });
      await page.getByRole("article", { name: "Packaged project" }).waitFor();
    } finally {
      await reopened.close();
    }
  },
);

interface DialogState {
  messages: MessageBoxOptions[];
  respond?: (response: { response: number; checkboxChecked: boolean }) => void;
}
type ElectronTestGlobal = typeof globalThis & { desktopSmokeDialog: DialogState };

async function observeDialogs(application: ElectronApplication) {
  // Playwright exercises the packaged dialog calls. Substitute the OS response
  // because native message boxes are outside Chromium's input automation.
  await application.evaluate(({ dialog }) => {
    const state: DialogState = { messages: [] };
    (globalThis as ElectronTestGlobal).desktopSmokeDialog = state;
    dialog.showMessageBox = (parentOrOptions, options?: MessageBoxOptions) => {
      state.messages.push(options ?? (parentOrOptions as MessageBoxOptions));
      return new Promise((resolve) => {
        state.respond = resolve;
      });
    };
  });
  return {
    read: () =>
      application.evaluate(() => (globalThis as ElectronTestGlobal).desktopSmokeDialog.messages),
    restart: () =>
      application.evaluate(() =>
        (globalThis as ElectronTestGlobal).desktopSmokeDialog.respond?.({
          response: 0,
          checkboxChecked: false,
        }),
      ),
  };
}

desktopTest(
  "Offers to restart after a server crash and reconnects the renderer",
  async ({ desktop }) => {
    const application = await launch(desktop);
    try {
      const page = await application.firstWindow({ timeout: 10_000 });
      await page.getByTestId("empty-home-create").waitFor();
      const dialogs = await observeDialogs(application);
      const originalServer = serverPid(application);

      process.kill(originalServer, "SIGKILL");

      await expect
        .poll(dialogs.read)
        .toMatchObject([{ type: "error", buttons: ["Restart", "Quit"] }]);
      const reload = page.waitForEvent("load");
      await dialogs.restart();
      await reload;
      await page.getByTestId("empty-home-create").waitFor();
      expect(serverPid(application)).not.toBe(originalServer);
    } finally {
      await application.close();
    }
  },
);

async function denyBackupDirectories(directory: string) {
  if (process.platform !== "win32") {
    await chmod(directory, 0o500);
    return () => chmod(directory, 0o700);
  }
  // AD is Add Subdirectory. Leave the already present SQLite file writable.
  const icacls = promisify(execFile);
  await icacls("icacls.exe", [directory, "/deny", "*S-1-1-0:(AD)"]);
  return () => icacls("icacls.exe", [directory, "/remove:d", "*S-1-1-0"]);
}

const startupFailures = [
  {
    name: "an unrecognized schema",
    diagnostic: "Unrecognized Task Tracker database schema",
    prepare: async (database: string) => {
      await rm(database);
      using invalid = new DatabaseSync(database);
      invalid.exec("CREATE TABLE Unexpected (Id INTEGER)");
      return undefined;
    },
  },
  {
    name: "a failed backup",
    diagnostic: "Could not back up the database.",
    prepare: async (database: string) => {
      const fixture = new URL("../../server/test/fixtures/ef/phase-3.db", import.meta.url);
      const directory = dirname(database);
      if (process.platform === "win32") {
        await copyFile(fixture, database);
      } else {
        // SQLite writes its journal beside the resolved file. Keep that folder
        // writable while denying the server's backup mkdir beside the symlink.
        const target = join(directory, "..", "legacy.db");
        await copyFile(fixture, target);
        await rm(database);
        await symlink(target, database);
      }
      return denyBackupDirectories(directory);
    },
  },
];

desktopTest.for(startupFailures)(
  "Shows a startup failure for $name",
  async ({ diagnostic, prepare }, { desktop }) => {
    const application = await launch(desktop);
    try {
      const page = await application.firstWindow({ timeout: 10_000 });
      await page.getByTestId("empty-home-create").waitFor();
      const dialogs = await observeDialogs(application);
      process.kill(serverPid(application), "SIGKILL");
      await expect.poll(dialogs.read, { timeout: 10_000 }).toHaveLength(1);
      const restoreAccess = await prepare(desktop.database);

      try {
        await dialogs.restart();

        await expect.poll(dialogs.read, { timeout: 10_000 }).toMatchObject([
          { buttons: ["Restart", "Quit"] },
          {
            type: "error",
            title: "Task Tracker could not start",
            detail: expect.stringContaining(diagnostic),
            buttons: ["Quit"],
          },
        ]);
      } finally {
        await restoreAccess?.();
      }
    } finally {
      await application.close();
    }
  },
);
