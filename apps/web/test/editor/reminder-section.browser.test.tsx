import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  EDITOR_ITEM,
  editor,
  openEditor,
  openEditorWorkspace,
  OTHER_ITEM,
  pick,
} from "../support/item-editor-page.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const reminder = () => editor().getByRole("region", { name: "Reminder" });
const choice = () => reminder().getByRole("combobox", { name: "Reminder", exact: true });
const saveButton = () => editor().getByTestId("item-editor-save");

async function openReminder(configure?: Parameters<typeof openEditorWorkspace>[0]) {
  const app = await openEditorWorkspace(configure);
  await openEditor();
  const stored = () => app.store.findItemByTitle(app.projectId, null, EDITOR_ITEM)?.item;
  return { ...app, stored };
}

describe("Reminder section", () => {
  it("Saves a reminder choice selected with the mouse", async () => {
    const { stored, store } = await openReminder();
    await expect.element(choice()).toHaveTextContent("Default");

    await pick("Reminder", "15 minutes before");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(stored()?.reminder).toEqual({ kind: "offset", minutes: 15 });
    expect(store.calls).toContain("EditItem");
  });

  it("Chooses None with the keyboard and discards the change", async () => {
    const { stored } = await openReminder();
    await choice().click();
    await expect.element(page.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    await expect.element(choice()).toHaveTextContent("None");
    await expect.element(choice()).toHaveFocus();
    await editor().getByTestId("item-editor-discard").click();
    await expect.element(choice()).toHaveTextContent("Default");
    await expect.element(saveButton()).toBeDisabled();
    expect(stored()?.reminder).toBeUndefined();
  });

  it("Escape closes the open list without closing the editor", async () => {
    await openReminder();
    await choice().click();
    await expect.element(page.getByRole("listbox")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(editor()).toBeVisible();
    await expect.element(choice()).toHaveFocus();
  });

  it("Shows a stored offset outside the list and says a reminder needs a due date", async () => {
    const app = await openEditorWorkspace({
      configure: (store, projectId) => {
        const other = store.findItemByTitle(projectId, null, OTHER_ITEM)!;
        store.patchItem(other.item.id, {
          dueDate: null,
          reminder: { kind: "offset", minutes: 45 },
        });
      },
    });

    await openEditor(OTHER_ITEM);

    await expect.element(choice()).toHaveTextContent("45 minutes before");
    await expect
      .element(reminder().getByTestId("item-editor-reminder-hint"))
      .toHaveTextContent("Reminders need a due date.");
    await pick("Reminder", "None");
    await expect
      .element(reminder().getByTestId("item-editor-reminder-hint"))
      .not.toBeInTheDocument();
    expect(app.store.calls).not.toContain("EditItem");
  });

  it.each(THEMES)("Matches the editor reminder baseline in %s", async (theme) => {
    await openReminder({
      configure: (store, projectId) => {
        const node = store.findItemByTitle(projectId, null, EDITOR_ITEM)!;
        store.patchItem(node.item.id, { reminder: { kind: "offset", minutes: 30 } });
      },
    });
    reminder().element().scrollIntoView({ block: "center" });

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`editor-reminder-${theme}`);
  });
});
