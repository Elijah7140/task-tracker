import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MessageBoxOptions } from "electron";
import type { ElectronApplication, Page } from "playwright";
import { expect } from "vitest";
import {
  type DesktopFixture,
  desktopTest,
  firstWindow,
  launch,
  phase3Fixture,
  withDesktop,
} from "../support/desktop-app.js";
import { serverPid } from "../support/desktop-processes.js";
import {
  SMOKE_PROJECT,
  addItem,
  chooseMenuCommand,
  createProject,
  expandCompleted,
  expectGone,
  goHome,
  isCompleted,
  itemRow,
  itemTree,
  openFolder,
  openProject,
  projectCard,
} from "../support/workflows.js";

interface DialogState {
  messages: MessageBoxOptions[];
  respond?: (response: { response: number; checkboxChecked: boolean }) => void;
}
type BackupTestGlobal = typeof globalThis & { desktopBackupDialog: DialogState };

/**
 * Records the packaged app's message boxes and answers them, because native
 * dialogs are outside Chromium's input automation.
 */
async function observeDialogs(application: ElectronApplication) {
  await application.evaluate(({ dialog }) => {
    const state: DialogState = { messages: [] };
    (globalThis as BackupTestGlobal).desktopBackupDialog = state;
    dialog.showMessageBox = (parentOrOptions, options?: MessageBoxOptions) => {
      state.messages.push(options ?? (parentOrOptions as MessageBoxOptions));
      return new Promise((resolve) => {
        state.respond = resolve;
      });
    };
  });
  return {
    read: () =>
      application.evaluate(() => (globalThis as BackupTestGlobal).desktopBackupDialog.messages),
    press: (button: number) =>
      application.evaluate(
        (_electron, response) =>
          (globalThis as BackupTestGlobal).desktopBackupDialog.respond?.({
            response,
            checkboxChecked: false,
          }),
        button,
      ),
  };
}

async function sha256(path: string) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

/** Backups in the database folder whose names match the pool. */
async function backupsIn(database: string, pool: RegExp) {
  return (await readdir(dirname(database))).filter((name) => pool.test(name)).sort();
}

const MIGRATION_BACKUP = /^tasktracker-\d+\.db\.bak$/;
const IMPORT_BACKUP = /^tasktracker-import-\d+\.db\.bak$/;

/** Item titles stored in a database file, read through a separate read-only handle. */
function storedTitles(path: string) {
  using database = new DatabaseSync(path, { readOnly: true });
  return database
    .prepare("SELECT Title FROM TodoItem ORDER BY Title")
    .all()
    .map((row) => row["Title"]);
}

/** Removes the database and its SQLite sidecars. */
async function removeDatabase(database: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    await rm(`${database}${suffix}`, { force: true });
  }
}

/** Restores a backup by replacing the closed database file and dropping stale sidecars. */
async function restoreBackup(database: string, backup: string) {
  await removeDatabase(database);
  await copyFile(join(dirname(database), backup), database);
}

/**
 * Puts a read-only Phase 3 file in place while the server is stopped. SQLite opens it
 * read-only, so the pending migrations fail after the pre-migration backup is written.
 */
async function placeReadOnlyLegacyFile(database: string) {
  await removeDatabase(database);
  await copyFile(phase3Fixture, database);
  await chmod(database, 0o444);
}

/** Restarts the server on the read-only file and returns the startup failure it reports. */
async function failMigrationOnRestart(desktop: DesktopFixture) {
  const application = await launch(desktop);
  try {
    const page = await firstWindow(application);
    await page.getByTestId("empty-home-create").waitFor();
    const dialogs = await observeDialogs(application);
    process.kill(await serverPid(application), "SIGKILL");
    await expect.poll(dialogs.read, { timeout: 10_000 }).toHaveLength(1);
    await placeReadOnlyLegacyFile(desktop.database);

    await dialogs.press(0);

    await expect.poll(dialogs.read, { timeout: 10_000 }).toHaveLength(2);
    return (await dialogs.read())[1];
  } finally {
    await application.close();
    await chmod(desktop.database, 0o644).catch(() => {});
  }
}

/** Opens the Phase 3 sample items, which sit under a completed parent in a nested folder. */
async function openPhase3Items(page: Page) {
  await openProject(page, "Sample project");
  await openFolder(page, "Sample folder", "Sample project");
  await openFolder(page, "Nested folder", "Sample project");
}

desktopTest(
  "A migration that fails leaves the pre-migration backup, and restoring it brings the legacy data back across relaunch",
  { timeout: 60_000 },
  async ({ desktop }) => {
    const failure = await failMigrationOnRestart(desktop);

    expect(failure).toMatchObject({
      type: "error",
      title: "Task Tracker could not start",
      detail: expect.stringContaining("attempt to write a readonly database"),
      buttons: ["Quit"],
    });
    expect(await sha256(desktop.database)).toBe(await sha256(phase3Fixture));
    const [backup, ...others] = await backupsIn(desktop.database, MIGRATION_BACKUP);
    expect(others).toEqual([]);
    // Read the fixture from a copy: even a read-only handle adds WAL sidecars beside the original.
    const expected = join(dirname(desktop.database), "expected.db");
    await copyFile(phase3Fixture, expected);
    expect(storedTitles(join(dirname(desktop.database), backup!))).toEqual(storedTitles(expected));
    await removeDatabase(expected);

    await restoreBackup(desktop.database, backup!);
    await withDesktop(desktop, async (page) => {
      await openPhase3Items(page);
      await addItem(page, "Nested folder", "Added after recovery");
    });

    await withDesktop(desktop, async (page) => {
      await openPhase3Items(page);

      await itemRow(page, "Nested folder", "Added after recovery").waitFor();
      await expandCompleted(itemTree(page, "Nested folder"), "Completed (1)");
      expect(await isCompleted(itemRow(page, "Nested folder", "Sample parent"))).toBe("true");
    });
    expect(await backupsIn(desktop.database, MIGRATION_BACKUP)).toHaveLength(2);
    expect(await backupsIn(desktop.database, MIGRATION_BACKUP)).toContain(backup);
    expect(existsSync(`${phase3Fixture}-wal`)).toBe(false);
    expect(existsSync(`${phase3Fixture}-shm`)).toBe(false);
  },
);

desktopTest(
  "Restoring the backup an import reports brings back the data from before the import",
  { timeout: 60_000 },
  async ({ desktop }) => {
    const file = join(dirname(desktop.database), "recovery-export.json");
    const environment = { TASKTRACKER_SMOKE: "1", TASKTRACKER_TEST_FILE_PATH: file };
    const imported = `${SMOKE_PROJECT} (imported)`;
    let reported = "";

    await withDesktop(
      desktop,
      async (page) => {
        await createProject(page);
        await openProject(page);
        await addItem(page, SMOKE_PROJECT, "Before import");
        await goHome(page);
        await chooseMenuCommand(page, "project", "transfer-export-project");
        await page.getByTestId("choice-dialog-submit").click();
        await page
          .getByTestId("transfer-status")
          .getByText(/^Exported /)
          .waitFor();

        await chooseMenuCommand(page, "file", "transfer-import-json");
        await page.getByTestId("confirm-dialog-confirm").click();
        await expectGone(page.getByTestId("confirm-dialog"));
        const status = page.getByTestId("transfer-status").getByText(/A backup was saved to /);
        await status.waitFor();
        await projectCard(page, imported).waitFor();
        reported = await status.innerText();
      },
      environment,
    );

    const [backup, ...others] = await backupsIn(desktop.database, IMPORT_BACKUP);
    expect(others).toEqual([]);
    expect(reported).toContain(backup);
    expect(await backupsIn(desktop.database, MIGRATION_BACKUP)).toEqual([]);

    await restoreBackup(desktop.database, backup!);
    await withDesktop(desktop, async (page) => {
      await projectCard(page, SMOKE_PROJECT).waitFor();
      expect(await projectCard(page, imported).count()).toBe(0);
      await openProject(page);

      await itemRow(page, SMOKE_PROJECT, "Before import").waitFor();
    });
  },
);
