import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  createProject,
  expandCompleted,
  expectGone,
  isCompleted,
  itemRow,
  itemTree,
  openItemEditor,
  openProject,
  pickOption,
  saveItemEditor,
} from "../support/workflows.js";

/** Closes the editor without changes. */
async function closeEditor(page: Page, editor: Locator) {
  await page.keyboard.press("Escape");
  await expectGone(editor);
}

/** Checks that the open card is the next weekly occurrence, due a week after the first. */
async function expectNextOccurrence(page: Page, title: string) {
  const card = itemRow(page, SMOKE_PROJECT, title);
  expect(await isCompleted(card)).toBe("false");
  expect(await card.getByTestId("repeat-marker").first().getAttribute("aria-label")).toBe(
    "Repeats: Weekly on Mon",
  );
  const editor = await openItemEditor(page, card);
  expect(await editor.getByLabel("Due date", { exact: true }).inputValue()).toBe("11/23/2026");
  await closeEditor(page, editor);
}

desktopTest(
  "Completing a weekly repeat shows the next open occurrence, also after relaunch",
  async ({ desktop }) => {
    const title = "Weekly review";
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, title);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
      await editor.getByLabel("Due date", { exact: true }).fill("2026-11-16");
      await pickOption(
        page,
        editor.getByRole("combobox", { name: "Repeat", exact: true }),
        "Weekly",
      );
      await saveItemEditor(editor);
      await itemRow(page, SMOKE_PROJECT, title).getByTestId("repeat-marker").first().waitFor();

      await itemRow(page, SMOKE_PROJECT, title).getByTestId("item-completion").first().click();

      await itemTree(page, SMOKE_PROJECT)
        .getByRole("treeitem", { name: "Completed (1)", exact: true })
        .waitFor();
      await expectNextOccurrence(page, title);
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      await expectNextOccurrence(page, title);
      await expandCompleted(itemTree(page, SMOKE_PROJECT), "Completed (1)");

      expect(await itemRow(page, SMOKE_PROJECT, title).count()).toBe(2);
    });
  },
);

desktopTest(
  "Markdown notes preview and a saved link is there after reopening and after relaunch",
  async ({ desktop }) => {
    const title = "Markdown item";
    const expectSavedLinkAndPreview = async (page: Page) => {
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
      const link = editor.getByTestId("item-editor-link-open");
      expect(await link.getAttribute("aria-label")).toBe("Spec page");
      expect(await link.getAttribute("title")).toBe("https://example.com/spec");
      await editor.getByTestId("item-editor-notes-preview-tab").click();
      expect(await editor.getByTestId("markdown-link").innerText()).toBe("docs");
      await closeEditor(page, editor);
    };
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, title);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));

      await editor
        .getByTestId("item-editor-notes")
        .fill("Read the [docs](https://example.com/docs) now");
      await editor.getByTestId("item-editor-notes-preview-tab").click();
      expect(await editor.getByTestId("markdown-link").innerText()).toBe("docs");
      await editor.getByTestId("item-editor-notes-edit").click();
      await editor.getByTestId("item-editor-link-url").fill("https://example.com/spec");
      await editor.getByTestId("item-editor-link-title").fill("Spec page");
      await editor.getByTestId("item-editor-link-submit").click();
      await editor.getByTestId("item-editor-link-open").waitFor();
      await saveItemEditor(editor);

      await expectSavedLinkAndPreview(page);
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);

      await expectSavedLinkAndPreview(page);
    });
  },
);
