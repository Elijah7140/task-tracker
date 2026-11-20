import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  addItem,
  createProject,
  expectGone,
  itemRow,
  openProject,
  projectCard,
  SMOKE_PROJECT,
} from "./support/workflows.js";

const IMPORTED = `${SMOKE_PROJECT} (imported)`;

/** Chooses an item from the home page's Import and export menu. */
async function chooseTransfer(
  page: Page,
  item: "transfer-export-project" | "transfer-import-json",
) {
  await page.getByTestId("transfer-menu-button").click();
  await page.getByTestId(item).click();
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
