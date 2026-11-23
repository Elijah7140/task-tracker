import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  chooseMenuCommand,
  confirmWithEnter,
  createFolder,
  createProject,
  expectGone,
  folderRow,
  isCompleted,
  itemRow,
  itemTree,
  openFolder,
  openProject,
  selectItem,
} from "../support/workflows.js";

/** Cards take an "into" drop in the middle of their header line (§7.17). */
const CARD_HEADER_OFFSET = 16;

/** The middle of a card's header line, or of a row or folder. */
async function dropPoint(target: Locator, onCardHeader: boolean) {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("The drag target is not on screen.");
  }
  const y = onCardHeader ? CARD_HEADER_OFFSET : box.height / 2;
  return { x: box.x + box.width / 2, y: box.y + y };
}

/** Drags an item with the real mouse, in small steps as a hand would. */
async function dragItem(page: Page, source: Locator, target: Locator, onCardHeader: boolean) {
  const from = await dropPoint(source.getByTestId("item-row").first(), true);
  const to = await dropPoint(target, onCardHeader);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}

/** Whether `child` is shown as a sub-item row inside the `parent` card. */
async function isNestedIn(page: Page, area: string, child: string, parent: string) {
  const nested = itemRow(page, area, parent).getByRole("treeitem", { name: child, exact: true });
  return (await nested.count()) === 1 && (await nested.getAttribute("aria-level")) === "2";
}

desktopTest(
  "Item drag, keyboard indent and a drop on a folder survive relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Parent item");
      await addItem(page, SMOKE_PROJECT, "Dragged item");
      const parent = itemRow(page, SMOKE_PROJECT, "Parent item");

      await dragItem(
        page,
        itemRow(page, SMOKE_PROJECT, "Dragged item"),
        parent.getByTestId("item-row").first(),
        true,
      );
      await expect
        .poll(() => isNestedIn(page, SMOKE_PROJECT, "Dragged item", "Parent item"))
        .toBe(true);
      await addItem(page, SMOKE_PROJECT, "Keyboard child");
      await selectItem(page, SMOKE_PROJECT, "Keyboard child");
      await page.keyboard.press("Alt+ArrowRight");
      await expect
        .poll(() => isNestedIn(page, SMOKE_PROJECT, "Keyboard child", "Parent item"))
        .toBe(true);

      await createFolder(page, "Destination");
      await page.getByTestId("sidebar-project-link").click();
      await parent.waitFor();
      await dragItem(
        page,
        parent,
        folderRow(page, SMOKE_PROJECT, "Destination").getByTestId("folder-row").first(),
        false,
      );

      await page.getByRole("heading", { level: 1, name: "Destination" }).waitFor();
      await itemRow(page, "Destination", "Parent item").waitFor();
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      expect(await itemRow(page, SMOKE_PROJECT, "Parent item").count()).toBe(0);
      await openFolder(page, "Destination");

      await expect
        .poll(() => isNestedIn(page, "Destination", "Dragged item", "Parent item"))
        .toBe(true);
      expect(await isNestedIn(page, "Destination", "Keyboard child", "Parent item")).toBe(true);
    });
  },
);

desktopTest(
  "Trash restores an item and permanently deletes a folder, and both stay that way after relaunch",
  async ({ desktop }) => {
    const batch = (page: Page, name: string) =>
      page.getByTestId("trash-list").getByRole("article", { name, exact: true });
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Restore me");
      await selectItem(page, SMOKE_PROJECT, "Restore me");
      await page.keyboard.press("Delete");
      await confirmWithEnter(page);
      await expectGone(itemRow(page, SMOKE_PROJECT, "Restore me"));
      await createFolder(page, "Doomed folder");
      await folderRow(page, SMOKE_PROJECT, "Doomed folder")
        .getByTestId("folder-row")
        .first()
        .click({ button: "right" });
      await page.getByTestId("folder-delete").click();
      await confirmWithEnter(page);
      await expectGone(folderRow(page, SMOKE_PROJECT, "Doomed folder"));

      await chooseMenuCommand(page, "view", "menu-trash");
      await batch(page, "Restore me").waitFor();
      await batch(page, "Doomed folder").waitFor();
      await batch(page, "Restore me").getByRole("button", { name: "Restore" }).click();
      await expectGone(batch(page, "Restore me"));
      await batch(page, "Doomed folder")
        .getByRole("button", { name: "Delete permanently" })
        .click();
      // An irreversible change starts on Cancel, so confirm with the pointer.
      await page.getByTestId("confirm-dialog-confirm").click();
      await expectGone(page.getByTestId("confirm-dialog"));
      await page.getByText("The trash is empty.").waitFor();
      await page.getByTestId("trash-back").click();

      await itemRow(page, SMOKE_PROJECT, "Restore me").waitFor();
      expect(await folderRow(page, SMOKE_PROJECT, "Doomed folder").count()).toBe(0);
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      await itemRow(page, SMOKE_PROJECT, "Restore me").waitFor();
      expect(await folderRow(page, SMOKE_PROJECT, "Doomed folder").count()).toBe(0);
      await chooseMenuCommand(page, "view", "menu-trash");

      await page.getByText("The trash is empty.").waitFor();
    });
  },
);

/** Expands the area's Completed section unless a refresh kept it expanded. */
async function showCompletedSection(page: Page, area: string) {
  const section = itemTree(page, area).getByRole("treeitem", {
    name: "Completed (1)",
    exact: true,
  });
  if ((await section.getAttribute("aria-expanded")) !== "true") {
    await section.getByTestId("completed-section-toggle").first().click();
  }
}

/** Opens the Edit menu, reads the Undo entry and closes the menu again. */
async function undoEntry(page: Page) {
  await page.getByTestId("menu-edit").click();
  const undo = page.getByTestId("edit-menu").getByTestId("history-undo");
  const state = {
    label: (await undo.innerText()).split("\n")[0]?.trim(),
    disabled: (await undo.getAttribute("data-disabled")) !== null,
  };
  await page.keyboard.press("Escape");
  await expectGone(page.getByTestId("edit-menu"));
  return state;
}

/** Presses an Edit shortcut with the Edit menu focused, as the legacy smoke did. */
async function pressWithEditMenuFocused(page: Page, keys: string) {
  await page.getByTestId("menu-edit").focus();
  await page.keyboard.press(keys);
}

desktopTest(
  "Undo restores a deleted and completed item, redo completes it again, and the result outlives the session history",
  async ({ desktop }) => {
    const title = "Undo smoke item";
    const row = (page: Page) => itemRow(page, SMOKE_PROJECT, title);
    const showCompleted = (page: Page) => showCompletedSection(page, SMOKE_PROJECT);
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, title);
      await row(page).getByTestId("item-completion").first().click();
      await expectGone(row(page));
      await showCompleted(page);
      await selectItem(page, SMOKE_PROJECT, title);
      await page.keyboard.press("Delete");
      await confirmWithEnter(page);
      await expectGone(row(page));

      expect((await undoEntry(page)).label).toBe(`Undo: Delete '${title}'`);
      await pressWithEditMenuFocused(page, "Control+Z");
      await showCompleted(page);
      await row(page).waitFor();
      expect(await isCompleted(row(page))).toBe("true");
      await pressWithEditMenuFocused(page, "Control+Z");
      await expect.poll(() => isCompleted(row(page))).toBe("false");
      await pressWithEditMenuFocused(page, "Control+Y");

      await expect.poll(() => isCompleted(row(page))).toBe("true");
      expect((await undoEntry(page)).label).toBe(`Undo: Complete '${title}'`);
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      await showCompleted(page);

      expect(await isCompleted(row(page))).toBe("true");
      expect(await undoEntry(page)).toEqual({ label: "Undo", disabled: true });
    });
  },
);
