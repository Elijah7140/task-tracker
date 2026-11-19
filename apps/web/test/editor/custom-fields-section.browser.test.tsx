import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import {
  customInput,
  EDITOR_ITEM,
  editor,
  editorTitle,
  openEditor,
  openEditorWorkspace,
  OTHER_ITEM,
  pick,
  type SeededFields,
  seedEveryFieldType,
} from "../support/item-editor-page.js";

const saveButton = () => editor().getByTestId("item-editor-save");
const numberError = () => editor().getByTestId("custom-field-number-error");

/** Values the legacy tests expect after filling every input. */
function filledValues(itemId: string, fields: SeededFields) {
  const row = { itemId, textValue: null, numberValue: null, dateValue: null, boolValue: null };
  return [
    { ...row, fieldDefinitionId: fields.summary, textValue: "Check cost", choiceId: null },
    { ...row, fieldDefinitionId: fields.effort, numberValue: 3.5, choiceId: null },
    { ...row, fieldDefinitionId: fields.review, dateValue: "2026-11-19", choiceId: null },
    { ...row, fieldDefinitionId: fields.approved, boolValue: true, choiceId: null },
    { ...row, fieldDefinitionId: fields.status, choiceId: fields.ready },
  ];
}

async function fillEveryField() {
  await customInput("Summary").fill("Check cost");
  await customInput("Effort").fill("3.5");
  await customInput("Review date").fill("2026-11-19");
  await pick("Approved", "Yes");
  await pick("Status", "Ready");
}

async function expectEveryFieldFilled() {
  await expect.element(customInput("Summary")).toHaveValue("Check cost");
  await expect.element(customInput("Effort")).toHaveValue("3.5");
  await expect.element(customInput("Review date")).toHaveValue("2026-11-19");
  await expect.element(customInput("Approved")).toHaveTextContent("Yes");
  await expect.element(customInput("Status")).toHaveTextContent("Ready");
}

/** Opens the workspace with every field type, running `seed` for extra stored values. */
async function openWithFields(
  seed: (store: FakeProjectStore, fields: SeededFields, itemId: string) => void = () => {},
) {
  let seeded: SeededFields | undefined;
  const app = await openEditorWorkspace({
    configure: (store, projectId) => {
      seeded = seedEveryFieldType(store);
      seed(store, seeded, store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "");
    },
  });
  const itemId = app.itemId(EDITOR_ITEM);
  return {
    ...app,
    fields: seeded!,
    itemId,
    stored: () => app.store.customFields.valuesFor(itemId),
  };
}

describe("Custom fields in the item editor", () => {
  it("Shows an input with the stored value for each field type", async () => {
    await openWithFields((store, fields, itemId) => {
      store.customFields.setValue(itemId, fields.summary, { textValue: "Check cost" });
      store.customFields.setValue(itemId, fields.effort, { numberValue: 3.5 });
      store.customFields.setValue(itemId, fields.review, { dateValue: "2026-11-19" });
      store.customFields.setValue(itemId, fields.approved, { boolValue: true });
      store.customFields.setValue(itemId, fields.status, { choiceId: fields.ready });
    });

    await openEditor();

    await expectEveryFieldFilled();
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Gives each input type its own control with an accessible name and test ID", async () => {
    await openWithFields();

    await openEditor();

    await expect
      .element(customInput("Summary"))
      .toHaveAttribute("data-testid", "custom-field-text");
    await expect
      .element(customInput("Effort"))
      .toHaveAttribute("data-testid", "custom-field-number");
    await expect
      .element(customInput("Review date"))
      .toHaveAttribute("data-testid", "custom-field-date");
    await expect
      .element(customInput("Approved"))
      .toHaveAttribute("data-testid", "custom-field-boolean");
    await expect
      .element(customInput("Status"))
      .toHaveAttribute("data-testid", "custom-field-choice");
    await expect
      .element(editor().getByRole("button", { name: "Clear Review date" }))
      .toHaveAttribute("data-testid", "custom-field-clear-date");
  });

  it("Lists global fields first, then project fields, and no other project's fields", async () => {
    await openEditorWorkspace({
      projects: [{ name: "Billing DB", items: [{ title: EDITOR_ITEM }] }, { name: "Website" }],
      configure: (store, projectId) => {
        const website = store.summaries[1]?.project.id ?? "";
        store.customFields.addField("Project note", "Text", projectId);
        store.customFields.addField("Effort", "Number");
        store.customFields.addField("Website only", "Text", website);
        store.customFields.addField("Approved", "Boolean");
      },
    });

    await openEditor();

    const labels = editor().getByTestId("custom-field-label");
    await expect.element(labels.nth(2)).toHaveTextContent("Project note");
    expect(labels.elements().map((label) => label.textContent)).toEqual([
      "Effort",
      "Approved",
      "Project note",
    ]);
  });

  it("Hides the section when no custom fields apply", async () => {
    await openEditorWorkspace();

    await openEditor();

    await expect.element(editor().getByTestId("item-editor-subitems")).toBeVisible();
    await expect.element(editor().getByTestId("custom-fields")).not.toBeInTheDocument();
  });

  it("Filling one field of each type and saving stores every value", async () => {
    const { fields, itemId, stored } = await openWithFields();
    await openEditor();

    await fillEveryField();
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(stored()).toEqual(expect.arrayContaining(filledValues(itemId, fields)));
    expect(stored()).toHaveLength(5);
  });

  it("Shows the saved values after reopening the item", async () => {
    await openWithFields();
    await openEditor();
    await fillEveryField();
    await saveButton().click();
    await expect.element(editor()).not.toBeInTheDocument();

    await openEditor();

    await expectEveryFieldFilled();
  });

  it("Saves the built-in fields together with the custom values", async () => {
    const app = await openWithFields();
    await openEditor();

    await editorTitle().fill("Renamed");
    await customInput("Summary").fill("typed");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(app.store.findItemByTitle(app.projectId, null, "Renamed")).toBeDefined();
    expect(app.stored().map((row) => row.textValue)).toEqual(["typed"]);
  });

  it("Sends only the custom fields that changed", async () => {
    const app = await openWithFields((store, fields, itemId) => {
      store.customFields.setValue(itemId, fields.summary, { textValue: "original" });
    });
    await openEditor();
    app.store.customFields.setValue(app.itemId, app.fields.summary, {
      textValue: "changed elsewhere",
    });

    await customInput("Effort").fill("5");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(app.store.customFields.edits).toEqual([
      [{ fieldDefinitionId: app.fields.effort, numberValue: 5 }],
    ]);
    expect(app.stored().map((row) => row.textValue ?? row.numberValue)).toEqual([
      "changed elsewhere",
      5,
    ]);
  });

  it("Clearing a text value removes it on save", async () => {
    const { stored } = await openWithFields((store, fields, itemId) => {
      store.customFields.setValue(itemId, fields.summary, { textValue: "original" });
    });
    await openEditor();

    await customInput("Summary").fill("");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it("The clear button removes a stored date when saved", async () => {
    const { stored } = await openWithFields((store, fields, itemId) => {
      store.customFields.setValue(itemId, fields.review, { dateValue: "2026-11-19" });
    });
    await openEditor();

    await editor().getByTestId("custom-field-clear-date").click();
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(stored()).toEqual([]);
  });

  it("Choosing No stores false and choosing none removes the value", async () => {
    const app = await openWithFields((store, fields, itemId) => {
      store.customFields.setValue(itemId, fields.status, { choiceId: fields.ready });
    });
    await openEditor();

    await pick("Approved", "No");
    await pick("Status", "(none)");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(app.stored().map((row) => [row.fieldDefinitionId, row.boolValue])).toEqual([
      [app.fields.approved, false],
    ]);
  });

  it("An invalid number shows an inline message and disables save", async () => {
    await openWithFields();
    await openEditor();

    await customInput("Effort").fill("twelve");

    await expect.element(numberError()).toHaveTextContent("Enter a valid number.");
    await expect.element(customInput("Effort")).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(customInput("Effort"))
      .toHaveAccessibleDescription("Enter a valid number.");
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Fixing the number hides the message and enables save again", async () => {
    await openWithFields();
    await openEditor();
    await customInput("Effort").fill("twelve");

    await customInput("Effort").fill("12");

    await expect.element(numberError()).not.toBeInTheDocument();
    await expect.element(saveButton()).toBeEnabled();
  });

  it("Lists archived field values read-only under their own heading", async () => {
    await openEditorWorkspace({
      configure: (store, projectId) => {
        const itemId = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
        const summary = store.customFields.addField("Summary", "Text");
        store.customFields.setValue(itemId, summary.id, { textValue: "kept value" });
        store.customFields.archiveField(summary.id);
      },
    });

    await openEditor();

    const archived = editor().getByRole("region", { name: "Archived fields" });
    await expect.element(archived.getByText("Summary", { exact: true })).toBeVisible();
    await expect.element(archived.getByText("kept value", { exact: true })).toBeVisible();
    await expect.element(editor().getByTestId("custom-field-text")).not.toBeInTheDocument();
  });

  it("Archived field values survive saving other changes and are not sent", async () => {
    const app = await openEditorWorkspace({
      configure: (store, projectId) => {
        const itemId = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
        const summary = store.customFields.addField("Summary", "Text");
        store.customFields.setValue(itemId, summary.id, { textValue: "kept" });
        store.customFields.archiveField(summary.id);
      },
    });
    await openEditor();

    await editorTitle().fill("Renamed");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(app.store.customFields.edits).toEqual([[]]);
    expect(app.store.customFields.values.map((row) => row.textValue)).toEqual(["kept"]);
  });

  it("Labels an archived choice the item still uses and keeps it when saving", async () => {
    const app = await openEditorWorkspace({
      configure: (store, projectId) => {
        const itemId = store.findItemByTitle(projectId, null, EDITOR_ITEM)?.item.id ?? "";
        const status = store.customFields.addField("Status", "Choice");
        const retired = store.customFields.addChoice(status.id, "Retired");
        store.customFields.addChoice(status.id, "Ready");
        store.customFields.setValue(itemId, status.id, { choiceId: retired.id });
        store.customFields.archiveChoice(retired.id);
      },
    });
    await openEditor();
    await expect.element(customInput("Status")).toHaveTextContent("Retired (archived)");

    await editorTitle().fill("Renamed");
    await saveButton().click();

    await expect.element(editor()).not.toBeInTheDocument();
    const retired = app.store.customFields.choices.find((choice) => choice.label === "Retired");
    expect(app.store.customFields.values.map((row) => row.choiceId)).toEqual([retired?.id]);
  });

  it("Keeps a typed custom value when its choice list finishes loading", async () => {
    await openWithFields();
    await openEditor();

    await customInput("Summary").fill("typed first");
    await pick("Status", "Blocked");

    await expect.element(customInput("Summary")).toHaveValue("typed first");
    await expect.element(customInput("Status")).toHaveTextContent("Blocked");
  });

  it("Shows the server's rule message for a field archived elsewhere and keeps the draft", async () => {
    const app = await openWithFields();
    await openEditor();
    app.store.customFields.archiveField(app.fields.summary);

    await editorTitle().fill("Renamed");
    await customInput("Summary").fill("typed");
    await saveButton().click();

    await expect
      .element(editor().getByTestId("item-editor-error"))
      .toHaveTextContent("Archived fields cannot receive new values.");
    await expect.element(editorTitle()).toHaveValue("Renamed");
    await expect.element(customInput("Summary")).toHaveValue("typed");
    expect(app.store.findItemByTitle(app.projectId, null, EDITOR_ITEM)).toBeDefined();
    expect(app.stored()).toEqual([]);
  });

  it("Each item shows its own values", async () => {
    await openWithFields((store, fields, itemId) => {
      const other = store.summaries[0]?.project.id ?? "";
      const otherId = store.findItemByTitle(other, null, OTHER_ITEM)?.item.id ?? "";
      store.customFields.setValue(itemId, fields.effort, { numberValue: 1 });
      store.customFields.setValue(otherId, fields.effort, { numberValue: 2 });
    });

    await openEditor(OTHER_ITEM);

    await expect.element(customInput("Effort")).toHaveValue("2");
    await expect.element(page.getByTestId("custom-fields")).toBeVisible();
  });
});
