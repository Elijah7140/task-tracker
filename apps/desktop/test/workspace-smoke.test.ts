import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  addItem,
  answerPrompt,
  confirmWithEnter,
  createProject,
  expandCompleted,
  expectFocused,
  expectGone,
  folderRow,
  isCompleted,
  itemRow,
  itemTree,
  openProject,
  quickAdd,
  SMOKE_PROJECT,
} from "./support/workflows.js";

/** Focuses and selects an item row by clicking its title, as the legacy smoke did. */
function selectItem(page: Page, area: string, title: string) {
  return itemRow(page, area, title).getByTestId("item-title").first().click();
}

desktopTest(
  "Opening a project focuses quick-add and its new item persists after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);

      await openProject(page);
      await expectFocused(quickAdd(page));
      await page.keyboard.type("First item");
      await page.keyboard.press("Enter");

      await itemRow(page, SMOKE_PROJECT, "First item").waitFor();
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);

      await itemRow(page, SMOKE_PROJECT, "First item").waitFor();
    });
  },
);

desktopTest(
  "Completing the only sub-item completes its parent and both stay completed after relaunch",
  async ({ desktop }) => {
    const tree = (page: Page) => itemTree(page, SMOKE_PROJECT);
    const parent = (page: Page) => itemRow(page, SMOKE_PROJECT, "Parent item");
    const child = (page: Page) => itemRow(page, SMOKE_PROJECT, "Child item");
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Parent item");
      await selectItem(page, SMOKE_PROJECT, "Parent item");

      await page.keyboard.press("Control+Shift+N");
      await answerPrompt(page, "Title", "Child item");
      await child(page).getByTestId("item-completion").first().click();
      await expandCompleted(tree(page), "Completed (1)");
      await expandCompleted(parent(page), "1 completed");

      expect(await isCompleted(parent(page))).toBe("true");
      expect(await isCompleted(child(page))).toBe("true");
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      await expandCompleted(tree(page), "Completed (1)");
      await parent(page).getByTestId("item-toggle").first().click();
      await expandCompleted(parent(page), "1 completed");

      expect(await isCompleted(parent(page))).toBe("true");
      expect(await isCompleted(child(page))).toBe("true");
    });
  },
);

desktopTest(
  "Creates folders from the sidebar and a folder's context menu, and an item in a folder, that persist after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);

      await page.getByRole("button", { name: `New folder in ${SMOKE_PROJECT}` }).click();
      await answerPrompt(page, "Folder name", "Smoke Folder");
      const smokeFolder = folderRow(page, SMOKE_PROJECT, "Smoke Folder");
      await smokeFolder.getByTestId("folder-row").first().click({ button: "right" });
      await page
        .getByTestId("folder-context-menu")
        .getByRole("menuitem", { name: "New folder" })
        .click();
      await answerPrompt(page, "Folder name", "Nested folder");
      await folderRow(page, SMOKE_PROJECT, "Nested folder").waitFor();
      await smokeFolder.getByTestId("folder-row").first().click();
      await page.getByRole("heading", { level: 1, name: "Smoke Folder" }).waitFor();
      await addItem(page, "Smoke Folder", "Folder item");
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      const nested = folderRow(page, SMOKE_PROJECT, "Nested folder");
      expect(await nested.getAttribute("aria-level")).toBe("2");
      await folderRow(page, SMOKE_PROJECT, "Smoke Folder")
        .getByTestId("folder-row")
        .first()
        .click();

      await itemRow(page, "Smoke Folder", "Folder item").waitFor();
    });
  },
);

desktopTest(
  "Deleting an item with confirmation removes its row, also after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Keep me");
      await addItem(page, SMOKE_PROJECT, "Delete me");
      await selectItem(page, SMOKE_PROJECT, "Delete me");

      await page.keyboard.press("Delete");
      await page.getByRole("alertdialog", { name: "Delete item" }).waitFor();
      await confirmWithEnter(page);

      await expectGone(itemRow(page, SMOKE_PROJECT, "Delete me"));
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);

      await itemRow(page, SMOKE_PROJECT, "Keep me").waitFor();
      expect(await itemRow(page, SMOKE_PROJECT, "Delete me").count()).toBe(0);
    });
  },
);
