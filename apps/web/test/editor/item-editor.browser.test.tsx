import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  customInput,
  draftDialog,
  EDITOR_ITEM,
  editor,
  editorTitle,
  itemRow,
  openEditor,
  openEditorWorkspace,
  OTHER_ITEM,
  pick,
  seedEveryFieldType,
} from "../support/item-editor-page.js";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";

const SUB_ITEM = "Check query plan before/after";
const LEGACY_TYPE_ID = "019A0000-0000-7000-8000-000000001900";
const OLD_RANK_ID = "019A0000-0000-7000-8000-000000002900";

const field = (label: string) => editor().getByLabelText(label, { exact: true });
const saveButton = () => editor().getByTestId("item-editor-save");
const editorError = () => editor().getByTestId("item-editor-error");

function storedItem(app: Awaited<ReturnType<typeof openEditorWorkspace>>, title: string) {
  return app.store.findItemByTitle(app.projectId, null, title)?.item;
}

describe("Item editor", () => {
  describe("Opening", () => {
    it("Opens from the row context menu with the item's built-in values", async () => {
      await openEditorWorkspace();

      await openEditor();

      await expect.element(field("Ticket number")).toHaveValue("JIRA-1234");
      await expect.element(field("Type")).toHaveTextContent("Change");
      await expect.element(field("Priority")).toHaveTextContent("High");
      await expect.element(field("Due date")).toHaveValue("2026-11-20");
      await expect.element(field("Due time")).toHaveValue("");
      await expect.element(field("Description")).toHaveValue("");
    });

    it("Opens from the row overflow menu", async () => {
      await openEditorWorkspace();

      await itemRow(OTHER_ITEM).getByTestId("item-menu").first().click();
      await page.getByTestId("item-menu-edit").click();

      await expect.element(editorTitle()).toHaveValue(OTHER_ITEM);
    });

    it("Opens with Enter on a focused row and focuses the title", async () => {
      await openEditorWorkspace();
      itemRow(EDITOR_ITEM).element().focus();

      await userEvent.keyboard("{Enter}");

      await expect.element(editorTitle()).toHaveFocus();
      await expect.element(editorTitle()).toHaveValue(EDITOR_ITEM);
    });

    it("Returns focus to the row after closing", async () => {
      await openEditorWorkspace();
      itemRow(EDITOR_ITEM).element().focus();
      await userEvent.keyboard("{Enter}");
      await expect.element(editorTitle()).toHaveFocus();

      await userEvent.keyboard("{Escape}");

      await expect.element(editor()).not.toBeInTheDocument();
      await expect.element(itemRow(EDITOR_ITEM)).toHaveFocus();
    });

    it("Gives every built-in control an accessible name and test ID", async () => {
      await openEditorWorkspace();

      await openEditor();

      for (const testId of [
        "item-editor-title",
        "item-editor-description",
        "item-editor-ticket",
        "item-editor-type",
        "item-editor-priority",
        "item-editor-due-date",
        "item-editor-due-time",
        "item-editor-scheduled-start",
        "item-editor-scheduled-end",
        "item-editor-discard",
        "item-editor-cancel",
        "item-editor-save",
        "item-editor-close",
      ]) {
        await expect.element(editor().getByTestId(testId)).toHaveAccessibleName();
      }
    });
  });

  describe("Built-in fields", () => {
    it("Saves every edited built-in field and closes", async () => {
      const app = await openEditorWorkspace();
      await openEditor(OTHER_ITEM);

      await editorTitle().fill("Fix nightly export");
      await field("Description").fill("Line one\nLine two");
      await field("Ticket number").fill("OPS-89");
      await pick("Type", "Discussion");
      await pick("Priority", "Low");
      await field("Due date").fill("2026-11-21");
      await field("Due time").fill("08:15");
      await field("Scheduled start").fill("2026-11-19T09:00");
      await field("Scheduled end").fill("2026-11-19T10:30");
      await saveButton().click();

      await expect.element(editor()).not.toBeInTheDocument();
      await expect.element(itemRow("Fix nightly export")).toBeVisible();
      expect(storedItem(app, "Fix nightly export")).toMatchObject({
        description: "Line one\nLine two",
        ticketNumber: "OPS-89",
        itemTypeId: "019A0000-0000-7000-8000-000000001002",
        priorityLevelId: "019A0000-0000-7000-8000-000000002003",
        dueDate: "2026-11-21",
        dueTime: "08:15",
        scheduledStart: "2026-11-19T09:00",
        scheduledEnd: "2026-11-19T10:30",
      });
    });

    it("Clears the type and priority with the None entries", async () => {
      const app = await openEditorWorkspace();
      await openEditor();

      await pick("Type", "None");
      await pick("Priority", "None");
      await saveButton().click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(storedItem(app, EDITOR_ITEM)).toMatchObject({
        itemTypeId: null,
        priorityLevelId: null,
      });
    });

    it("Clears dates and times with their clear buttons", async () => {
      const app = await openEditorWorkspace({
        configure: (store, projectId) => {
          const id = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
          store.patchItem(id, {
            dueTime: "17:00:00",
            scheduledStart: "2026-11-19T09:00:00",
            scheduledEnd: "2026-11-19T10:00:00",
          });
        },
      });
      await openEditor();

      await editor().getByRole("button", { name: "Clear scheduled end" }).click();
      await editor().getByRole("button", { name: "Clear scheduled start" }).click();
      await editor().getByRole("button", { name: "Clear due time" }).click();
      await editor().getByRole("button", { name: "Clear due date" }).click();
      await saveButton().click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(storedItem(app, EDITOR_ITEM)).toMatchObject({
        dueDate: null,
        dueTime: null,
        scheduledStart: null,
        scheduledEnd: null,
      });
    });

    it("Keeps stored precision for times that were not edited", async () => {
      const app = await openEditorWorkspace({
        configure: (store, projectId) => {
          const id = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
          store.patchItem(id, { dueTime: "17:00:00.1234567" });
        },
      });
      await openEditor();
      await expect.element(field("Due time")).toHaveValue("17:00");

      await field("Ticket number").fill("JIRA-1235");
      await saveButton().click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(storedItem(app, EDITOR_ITEM)?.dueTime).toBe("17:00:00.1234567");
    });

    it("Shows a refused title inline and stores nothing", async () => {
      const app = await openEditorWorkspace();
      await openEditor();

      await editorTitle().fill("  ");
      await saveButton().click();

      await expect
        .element(editorError())
        .toHaveTextContent("Item title is required and must be at most 300 characters.");
      await expect.element(editorTitle()).toHaveValue("  ");
      expect(storedItem(app, EDITOR_ITEM)?.title).toBe(EDITOR_ITEM);
    });

    it("Keeps an archived type and priority labelled and unchanged when saving", async () => {
      const app = await openEditorWorkspace({
        configure: (store, projectId) => {
          const archived = { colorKey: null, isBuiltIn: false, isArchived: true, sortOrder: 9 };
          store.extraLookups.itemTypes.push({
            ...archived,
            id: LEGACY_TYPE_ID,
            name: "Legacy",
            iconKey: null,
          });
          store.extraLookups.priorityLevels.push({
            ...archived,
            id: OLD_RANK_ID,
            name: "Old rank",
          });
          const id = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
          store.patchItem(id, { itemTypeId: LEGACY_TYPE_ID, priorityLevelId: OLD_RANK_ID });
        },
      });
      await openEditor();
      await expect.element(field("Type")).toHaveTextContent("Legacy (archived)");
      await expect.element(field("Priority")).toHaveTextContent("Old rank (archived)");

      await field("Ticket number").fill("JIRA-9");
      await saveButton().click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(storedItem(app, EDITOR_ITEM)).toMatchObject({
        ticketNumber: "JIRA-9",
        itemTypeId: LEGACY_TYPE_ID,
        priorityLevelId: OLD_RANK_ID,
      });
    });

    it("Offers archived lookups only as the item's current value", async () => {
      await openEditorWorkspace({
        configure: (store) => {
          store.extraLookups.itemTypes.push({
            id: LEGACY_TYPE_ID,
            name: "Legacy",
            colorKey: null,
            iconKey: null,
            isBuiltIn: false,
            isArchived: true,
            sortOrder: 9,
          });
        },
      });
      await openEditor();

      await editor().getByRole("combobox", { name: "Type" }).click();

      await expect.element(page.getByRole("option", { name: "Change" })).toBeVisible();
      await expect.element(page.getByRole("option", { name: /Legacy/ })).not.toBeInTheDocument();
    });
  });

  describe("Discarding and closing", () => {
    it("Closes with Escape without asking when nothing changed", async () => {
      await openEditorWorkspace();
      await openEditor();

      await userEvent.keyboard("{Escape}");

      await expect.element(editor()).not.toBeInTheDocument();
      await expect.element(draftDialog()).not.toBeInTheDocument();
    });

    it("Asks before closing with Escape when the draft changed", async () => {
      await openEditorWorkspace();
      await openEditor();
      await editorTitle().fill("Draft");

      await userEvent.keyboard("{Escape}");

      await expect.element(draftDialog()).toBeVisible();
      await expect.element(page.getByTestId("draft-dialog-save")).toHaveFocus();
    });

    it("Keeps typed built-in and custom values when the question is cancelled", async () => {
      const app = await openEditorWorkspace({ configure: (store) => seedEveryFieldType(store) });
      await openEditor();
      await editorTitle().fill("Draft title");
      await customInput("Summary").fill("unsaved");
      await editor().getByTestId("item-editor-cancel").click();
      await expect.element(draftDialog()).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.element(draftDialog()).not.toBeInTheDocument();
      await expect.element(editorTitle()).toHaveValue("Draft title");
      await expect.element(customInput("Summary")).toHaveValue("unsaved");
      expect(storedItem(app, EDITOR_ITEM)?.title).toBe(EDITOR_ITEM);
      expect(app.store.customFields.values).toEqual([]);
    });

    it("Discarding from the question closes and stores nothing", async () => {
      const app = await openEditorWorkspace({ configure: (store) => seedEveryFieldType(store) });
      await openEditor();
      await customInput("Summary").fill("unsaved");
      await editor().getByRole("button", { name: "Close editor" }).click();

      await page.getByTestId("draft-dialog-discard").click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(app.store.customFields.values).toEqual([]);
      expect(app.store.calls).not.toContain("EditItem");
    });

    it("Saving from the question stores the draft and closes", async () => {
      const app = await openEditorWorkspace({ configure: (store) => seedEveryFieldType(store) });
      const fields = app.store.customFields;
      await openEditor();
      await customInput("Summary").fill("unsaved");
      await userEvent.keyboard("{Escape}");

      await page.getByTestId("draft-dialog-save").click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(fields.valuesFor(app.itemId(EDITOR_ITEM)).map((row) => row.textValue)).toEqual([
        "unsaved",
      ]);
    });

    it("Saving from the question with an invalid number shows why and stays open", async () => {
      const app = await openEditorWorkspace({ configure: (store) => seedEveryFieldType(store) });
      await openEditor();
      await customInput("Effort").fill("twelve");
      await userEvent.keyboard("{Escape}");

      await page.getByTestId("draft-dialog-save").click();

      await expect
        .element(editorError())
        .toHaveTextContent("Fix the custom field values marked in red first.");
      await expect.element(customInput("Effort")).toHaveValue("twelve");
      expect(app.store.calls).not.toContain("EditItem");
    });

    it("Discarding from the question with an invalid number closes and stores nothing", async () => {
      const app = await openEditorWorkspace({ configure: (store) => seedEveryFieldType(store) });
      await openEditor();
      await customInput("Effort").fill("twelve");
      await userEvent.keyboard("{Escape}");

      await page.getByTestId("draft-dialog-discard").click();

      await expect.element(editor()).not.toBeInTheDocument();
      expect(app.store.customFields.values).toEqual([]);
      expect(app.store.calls).not.toContain("EditItem");
    });

    it("Ignores workspace shortcuts while the editor is open and keeps the draft", async () => {
      const app = await openEditorWorkspace();
      await openEditor();
      await editorTitle().fill("Draft");

      await userEvent.keyboard("{Control>}n{/Control}");
      await userEvent.keyboard("{Control>}{Shift>}n{/Shift}{/Control}");

      await expect.element(editorTitle()).toHaveValue("Draft");
      await expect
        .element(page.getByRole("dialog", { name: "New sub-item" }))
        .not.toBeInTheDocument();
      expect(app.store.calls).not.toContain("CreateItem");
    });

    it("Discard changes puts back the stored values and stores nothing", async () => {
      const app = await openEditorWorkspace({ configure: (store) => seedEveryFieldType(store) });
      await openEditor();
      await editorTitle().fill("Unsaved title");
      await customInput("Summary").fill("unsaved");

      await editor().getByTestId("item-editor-discard").click();

      await expect.element(editorTitle()).toHaveValue(EDITOR_ITEM);
      await expect.element(customInput("Summary")).toHaveValue("");
      await expect.element(editor().getByTestId("item-editor-discard")).toBeDisabled();
      expect(app.store.calls).not.toContain("EditItem");
    });

    it("Disables Save until the draft changes", async () => {
      await openEditorWorkspace();
      await openEditor();
      await expect.element(saveButton()).toBeDisabled();

      await field("Ticket number").fill("JIRA-1");

      await expect.element(saveButton()).toBeEnabled();
    });
  });

  describe("Loading", () => {
    it("Keeps typed built-in edits while custom fields load and after they arrive", async () => {
      let release = () => {};
      const app = await openEditorWorkspace({
        configure: (store, projectId) => {
          const fields = seedEveryFieldType(store);
          const id = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
          store.customFields.setValue(id, fields.summary, { textValue: "stored" });
          release = store.customFields.holdValues(id);
        },
      });
      await openEditor();
      await expect.element(editor().getByTestId("custom-fields-loading")).toBeVisible();

      await editorTitle().fill("Typed while loading");
      release();

      await expect.element(customInput("Summary")).toHaveValue("stored");
      await expect.element(editorTitle()).toHaveValue("Typed while loading");
      expect(app.store.calls).toContain("LoadItemFieldValues");
    });

    it("Keeps typed edits when the area refreshes urgency each minute", async () => {
      const { clock, advance } = createTestClock();
      const app = await openEditorWorkspace({
        clock,
        configure: (store) => seedEveryFieldType(store),
      });
      await openEditor();
      await editorTitle().fill("Typed before refresh");
      await customInput("Effort").fill("5");
      const loads = app.store.calls.filter((call) => call === "LoadArea").length;

      await advance("1 minute");

      await expect
        .poll(() => app.store.calls.filter((call) => call === "LoadArea").length)
        .toBeGreaterThan(loads);
      await expect.element(editorTitle()).toHaveValue("Typed before refresh");
      await expect.element(customInput("Effort")).toHaveValue("5");
    });

    it("Shows each item's own values when a slower earlier load finishes last", async () => {
      let releaseParent = () => {};
      await openEditorWorkspace({
        configure: (store, projectId) => {
          const fields = seedEveryFieldType(store);
          const parent = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
          const child = store.findItemByTitle(projectId, null, SUB_ITEM)?.item.id ?? "";
          store.customFields.setValue(parent, fields.effort, { numberValue: 1 });
          store.customFields.setValue(child, fields.effort, { numberValue: 2 });
          releaseParent = store.customFields.holdValues(parent);
        },
      });
      await openEditor();

      await editor().getByRole("button", { name: SUB_ITEM }).click();
      await expect.element(customInput("Effort")).toHaveValue("2");
      releaseParent();

      await expect.element(editorTitle()).toHaveValue(SUB_ITEM);
      await expect.element(customInput("Effort")).toHaveValue("2");
    });

    it("Refreshes the field list each time an item opens", async () => {
      const app = await openEditorWorkspace();
      await openEditor();
      await userEvent.keyboard("{Escape}");
      await expect.element(editor()).not.toBeInTheDocument();
      app.store.customFields.addField("Effort", "Number");

      await openEditor(OTHER_ITEM);

      await expect.element(customInput("Effort")).toBeVisible();
    });
  });

  describe("Sub-items", () => {
    it("Lists the item's sub-items with their completion state", async () => {
      await openEditorWorkspace();

      await openEditor();

      const list = editor().getByRole("list", { name: "Sub-items" });
      const buttons = list.getByTestId("item-editor-subitem");
      await expect.element(buttons.nth(0)).toHaveAccessibleName(SUB_ITEM);
      await expect.element(buttons.nth(0)).toHaveAttribute("data-completed", "false");
      await expect
        .element(buttons.nth(1))
        .toHaveAccessibleName(/Draft migration script.*completed/);
      await expect.element(buttons.nth(1)).toHaveAttribute("data-completed", "true");
    });

    it("Opens a sub-item in the editor and goes back to its parent", async () => {
      await openEditorWorkspace();
      await openEditor();

      await editor().getByRole("button", { name: SUB_ITEM }).click();
      await expect.element(editorTitle()).toHaveValue(SUB_ITEM);
      await editor().getByTestId("item-editor-parent").click();

      await expect.element(editorTitle()).toHaveValue(EDITOR_ITEM);
    });

    it("Asks before opening a sub-item when the draft changed and stays on cancel", async () => {
      await openEditorWorkspace();
      await openEditor();
      await editorTitle().fill("Draft");

      await editor().getByRole("button", { name: SUB_ITEM }).click();
      await page.getByRole("button", { name: "Cancel" }).click();

      await expect.element(draftDialog()).not.toBeInTheDocument();
      await expect.element(editorTitle()).toHaveValue("Draft");
    });

    it("Opens the sub-item after the draft is discarded", async () => {
      const app = await openEditorWorkspace();
      await openEditor();
      await editorTitle().fill("Draft");

      await editor().getByRole("button", { name: SUB_ITEM }).click();
      await page.getByTestId("draft-dialog-discard").click();

      await expect.element(editorTitle()).toHaveValue(SUB_ITEM);
      expect(storedItem(app, EDITOR_ITEM)?.title).toBe(EDITOR_ITEM);
    });

    it("Adds a sub-item from the editor", async () => {
      await openEditorWorkspace();
      await openEditor(OTHER_ITEM);

      await editor().getByTestId("item-editor-add-subitem").click();
      await expect.element(page.getByRole("dialog", { name: "New sub-item" })).toBeVisible();
      await userEvent.keyboard("Read export logs{Enter}");

      await expect
        .element(
          editor().getByRole("list", { name: "Sub-items" }).getByRole("button", {
            name: "Read export logs",
          }),
        )
        .toBeVisible();
      await expect.element(editorTitle()).toHaveValue(OTHER_ITEM);
    });
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    const seedEditorBaseline = (store: FakeProjectStore, projectId: string) => {
      const fields = seedEveryFieldType(store);
      const id = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
      store.patchItem(id, {
        description: "Speeds up the customer invoice lookup on the billing dashboard.",
        scheduledStart: "2026-11-19T09:00:00",
      });
      store.customFields.setValue(id, fields.summary, { textValue: "Check cost" });
      store.customFields.setValue(id, fields.effort, { numberValue: 3.5 });
      store.customFields.setValue(id, fields.review, { dateValue: "2026-11-19" });
      store.customFields.setValue(id, fields.approved, { boolValue: true });
      store.customFields.setValue(id, fields.status, { choiceId: fields.ready });
      const legacy = store.customFields.addField("Legacy owner", "Text");
      store.customFields.setValue(id, legacy.id, { textValue: "Data team" });
      store.customFields.archiveField(legacy.id);
    };

    it("Matches the reviewed item editor baseline", async () => {
      await openEditorWorkspace({ configure: seedEditorBaseline });
      await openEditor();
      await expect.element(customInput("Status")).toHaveTextContent("Ready");
      await expect.element(customInput("Effort")).toHaveValue("3.5");

      await settleTheme(theme);

      await expect.element(page.getByTestId("app-shell")).toMatchScreenshot(`item-editor-${theme}`);
    });

    it("Matches the reviewed invalid custom number baseline", async () => {
      await openEditorWorkspace({ configure: seedEditorBaseline });
      await openEditor();
      await expect.element(customInput("Status")).toHaveTextContent("Ready");
      await customInput("Effort").fill("twelve");
      await expect.element(editor().getByTestId("custom-field-number-error")).toBeVisible();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`workspace-invalid-number-${theme}`);
    });

    it("Matches the reviewed unsaved draft baseline", async () => {
      await openEditorWorkspace();
      await openEditor();
      await editorTitle().fill("Add index to Invoice.CustomerId and InvoiceDate");
      await userEvent.keyboard("{Escape}");
      await expect.element(page.getByTestId("draft-dialog-save")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`unsaved-draft-${theme}`);
    });
  });
});
