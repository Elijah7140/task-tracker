import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, copyFile, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import type { MessageBoxOptions } from "electron";
import type { ElectronApplication, Page } from "playwright";
import { expect } from "vitest";
import {
  type DesktopFixture,
  desktopTest,
  executable,
  firstWindow,
  launch,
  phase3Fixture,
} from "../support/desktop-app.js";
import { isRunning, serverPid } from "../support/desktop-processes.js";
import { answerPrompt } from "../support/workflows.js";

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
      const page = await firstWindow(application);

      await page.getByTestId("empty-home-create").click();
      await answerPrompt(page, "Project name", "Packaged project");
      await page.getByRole("article", { name: "Packaged project" }).waitFor();
      child = await serverPid(application);

      expect(await runSecondInstance(desktop)).toEqual([0, null]);
      expect(await serverPid(application)).toBe(child);
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
      const page = await firstWindow(reopened);
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
      const page = await firstWindow(application);
      await page.getByTestId("empty-home-create").waitFor();
      const dialogs = await observeDialogs(application);
      const originalServer = await serverPid(application);

      process.kill(originalServer, "SIGKILL");

      await expect
        .poll(dialogs.read)
        .toMatchObject([{ type: "error", buttons: ["Restart", "Quit"] }]);
      const reload = page.waitForEvent("load");
      await dialogs.restart();
      await reload;
      await page.getByTestId("empty-home-create").waitFor();
      expect(await serverPid(application)).not.toBe(originalServer);
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
      const directory = dirname(database);
      if (process.platform === "win32") {
        await copyFile(phase3Fixture, database);
      } else {
        // SQLite writes its journal beside the resolved file. Keep that folder
        // writable while denying the server's backup mkdir beside the symlink.
        const target = join(directory, "..", "legacy.db");
        await copyFile(phase3Fixture, target);
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
      const page = await firstWindow(application);
      await page.getByTestId("empty-home-create").waitFor();
      const dialogs = await observeDialogs(application);
      process.kill(await serverPid(application), "SIGKILL");
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
