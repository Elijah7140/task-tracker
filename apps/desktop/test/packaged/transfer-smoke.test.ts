import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  chooseMenuCommand,
  createProject,
  expectGone,
  itemRow,
  openProject,
  projectCard,
} from "../support/workflows.js";

const IMPORTED = `${SMOKE_PROJECT} (imported)`;

/** Chooses an import or export command from the File or Project menu on Home (§7.9). */
async function chooseTransfer(
  page: Page,
  item:
    | "transfer-export-project"
    | "transfer-import-json"
    | "transfer-export-project-csv"
    | "transfer-import-csv",
) {
  await chooseMenuCommand(page, item === "transfer-import-json" ? "file" : "project", item);
}

async function goHome(page: Page) {
  await page.getByTestId("sidebar-home").click();
  await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor();
}

desktopTest(
  "Exports a project to JSON and imports it back as a second project that survives a relaunch",
  async ({ desktop }) => {
    const file = join(dirname(desktop.database), "smoke-export.json");
    // The test picker answers every dialog with this path (§7.9).
    const environment = { TASKTRACKER_SMOKE: "1", TASKTRACKER_TEST_FILE_PATH: file };

    await withDesktop(
      desktop,
      async (page) => {
        await createProject(page);
        await openProject(page);
        await addItem(page, SMOKE_PROJECT, "Exported item");
        await goHome(page);

        await chooseTransfer(page, "transfer-export-project");
        await page.getByTestId("choice-dialog-submit").click();
        await page
          .getByTestId("transfer-status")
          .getByText(/^Exported Smoke Project to /)
          .waitFor();
        await chooseTransfer(page, "transfer-import-json");
        await page.getByTestId("confirm-dialog-confirm").click();
        await expectGone(page.getByTestId("confirm-dialog"));
        await page
          .getByTestId("transfer-status")
          .getByText(/^Imported 1 project, 1 item\. A backup was saved to /)
          .waitFor();
        await projectCard(page, IMPORTED).waitFor();
      },
      environment,
    );

    const exported = JSON.parse(await readFile(file, "utf8")) as { projects: { name: string }[] };
    expect(exported.projects.map((project) => project.name)).toEqual([SMOKE_PROJECT]);

    await withDesktop(desktop, async (page) => {
      await openProject(page, IMPORTED);

      await itemRow(page, IMPORTED, "Exported item").waitFor();
    });
  },
);

const CSV_TARGET = "CSV Target";
const CSV_ITEM = 'Pay, "urgently"';

desktopTest(
  "Exports a project to CSV and imports the file into another project that keeps it after a relaunch",
  async ({ desktop }) => {
    const file = join(dirname(desktop.database), "smoke-export.csv");
    const environment = { TASKTRACKER_SMOKE: "1", TASKTRACKER_TEST_FILE_PATH: file };

    await withDesktop(
      desktop,
      async (page) => {
        await createProject(page);
        await openProject(page);
        await addItem(page, SMOKE_PROJECT, CSV_ITEM);
        await goHome(page);
        await createProject(page, CSV_TARGET);
        await goHome(page);

        await chooseTransfer(page, "transfer-export-project-csv");
        await page.getByRole("radio", { name: SMOKE_PROJECT }).click();
        await page.getByTestId("choice-dialog-submit").click();
        await page
          .getByTestId("transfer-status")
          .getByText(/^Exported Smoke Project to .*smoke-export\.csv\.$/)
          .waitFor();
        await chooseTransfer(page, "transfer-import-csv");
        await page.getByRole("radio", { name: CSV_TARGET }).click();
        await page.getByTestId("choice-dialog-submit").click();
        await page
          .getByTestId("csv-preview-status")
          .getByText("Ready to import 1 row as new items.")
          .waitFor();
        await page.getByTestId("csv-preview-import").click();
        await page
          .getByTestId("transfer-status")
          .getByText(/^Imported 1 item\. A backup was saved to /)
          .waitFor();
      },
      environment,
    );

    const bytes = await readFile(file);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8")).toContain('"Pay, ""urgently"""');

    await withDesktop(desktop, async (page) => {
      await openProject(page, CSV_TARGET);

      await itemRow(page, CSV_TARGET, CSV_ITEM).waitFor();
    });
  },
);
