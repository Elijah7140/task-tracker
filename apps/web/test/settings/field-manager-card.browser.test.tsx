import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

type Locator = ReturnType<typeof page.getByTestId>;

const manager = () => page.getByTestId("field-manager");
const fieldRows = () => manager().getByTestId("field-row");
const fieldRow = (name: string) => manager().getByRole("listitem", { name, exact: true });
const newName = () => manager().getByTestId("field-new-name");
const newType = () => manager().getByTestId("field-new-type");
const addButton = () => manager().getByTestId("field-add");
const showArchived = () => manager().getByTestId("field-show-archived");
const validationDialog = () => page.getByRole("alertdialog", { name: "Field validation" });
const choicesToggle = (field: string) => fieldRow(field).getByTestId("field-choices-toggle");
const choiceRows = (field: string) => fieldRow(field).getByTestId("field-choice-row");
const choiceRow = (field: string, label: string) =>
  fieldRow(field).getByRole("listitem", { name: label, exact: true });
const newChoice = (field: string) => fieldRow(field).getByTestId("choice-new-label");

async function openAppSettings(configure: (store: FakeProjectStore) => void = () => {}) {
  const app = await renderApp({ path: "/settings", configure });
  await expect.element(manager()).toBeVisible();
  await expect.element(newName()).toBeVisible();
  return app;
}

async function openProjectSettings(
  configure?: (store: FakeProjectStore, projectId: string) => void,
) {
  const app = await renderApp({
    projects: [{ name: "Billing DB" }],
    configure: (store) => configure?.(store, store.summaries[0]!.project.id),
  });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}/settings`);
  await expect.element(manager()).toBeVisible();
  await expect.element(newName()).toBeVisible();
  return { ...app, projectId };
}

async function chooseOption(trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function dismissValidation(message: string) {
  await expect.element(validationDialog()).toHaveAccessibleDescription(message);
  await page.getByTestId("message-dialog-ok").click();
  await expect.element(validationDialog()).not.toBeInTheDocument();
}

async function addField(name: string, submit: "enter" | "button") {
  await newName().fill(name);
  if (submit === "enter") {
    await userEvent.keyboard("{Enter}");
  } else {
    await addButton().click();
  }
}

function seedGlobalBaselineFields(store: FakeProjectStore) {
  store.customFields.addFieldSeed("Effort", "Number");
  store.customFields.addFieldSeed("Review date", "Date");
  store.customFields.addFieldSeed("Legacy code", "Text", { isArchived: true });
  const status = store.customFields.addFieldSeed("Status", "Choice");
  store.customFields.addChoiceSeed(status.id, "Ready");
  store.customFields.addChoiceSeed(status.id, "Blocked");
  store.customFields.addChoiceSeed(status.id, "Retired", { isArchived: true });
  store.customFields.addFieldSeed("Approved", "Boolean");
}

describe("FieldManagerCard", () => {
  describe("in App Settings", () => {
    it("Adds a field of each type with Enter and the Add button, keeping the chosen type", async () => {
      const { store } = await openAppSettings();

      await addField("Summary", "enter");
      await expect.element(fieldRow("Summary")).toBeVisible();
      await chooseOption(newType(), "Number");
      await addField("Effort", "button");
      await expect.element(fieldRow("Effort")).toBeVisible();
      await expect.element(newType()).toHaveTextContent("Number");
      await chooseOption(newType(), "Date");
      await addField("Review date", "button");
      await chooseOption(newType(), "Boolean");
      await addField("Approved", "button");
      await chooseOption(newType(), "Choice");
      await addField("Status", "enter");

      await expect.element(fieldRows().nth(4)).toHaveAccessibleName("Status");
      expect(store.customFields.fieldNames(null)).toEqual([
        "Summary",
        "Effort",
        "Review date",
        "Approved",
        "Status",
      ]);
      expect(store.customFields.scope(null).map((field) => field.dataType)).toEqual([
        "Text",
        "Number",
        "Date",
        "Boolean",
        "Choice",
      ]);
      await expect
        .element(fieldRow("Effort").getByTestId("field-type"))
        .toHaveTextContent("Number");
      await expect.element(newName()).toHaveValue("");
    });

    it("Rejects blank and duplicate names with a dialog and keeps the typed text", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
      });

      await addField("   ", "button");

      await dismissValidation("Field name must be 1 to 300 characters.");
      await expect.element(newName()).toHaveValue("   ");

      await addField("effort", "enter");

      await dismissValidation("Field name is already visible in this project.");
      await expect.element(newName()).toHaveValue("effort");
      expect(store.customFields.fieldNames(null)).toEqual(["Effort"]);
      await expect.element(fieldRows()).toHaveLength(1);
    });

    it("Opens the choices panel of a new choice field", async () => {
      await openAppSettings();
      await chooseOption(newType(), "Choice");

      await addField("Status", "enter");

      await expect.element(choicesToggle("Status")).toHaveAttribute("aria-expanded", "true");
      await expect.element(newChoice("Status")).toBeVisible();
    });

    it("Gives only choice fields a choices panel", async () => {
      await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
        appStore.customFields.addFieldSeed("Status", "Choice");
      });

      await expect.element(choicesToggle("Status")).toBeVisible();
      await expect.element(choicesToggle("Effort")).not.toBeInTheDocument();
    });

    it("Renames a field through the prompt and ignores a cancelled prompt", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
      });
      await newName().fill("Half typed");

      await fieldRow("Effort").getByTestId("field-rename").click();
      await expect.element(page.getByRole("dialog", { name: "Rename field" })).toBeVisible();
      await userEvent.keyboard("{Escape}");

      expect(store.calls).not.toContain("RenameField");
      await fieldRow("Effort").getByTestId("field-rename").click();
      await userEvent.keyboard("{Control>}a{/Control}Story points{Enter}");

      await expect.element(fieldRow("Story points")).toBeVisible();
      expect(store.customFields.fieldNames(null)).toEqual(["Story points"]);
      expect(store.customFields.fieldNamed("Story points").key).toBe("effort");
      await expect.element(newName()).toHaveValue("Half typed");
    });

    it("Keeps the rename prompt open with the length message for a name over 300 characters", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
      });

      await fieldRow("Effort").getByTestId("field-rename").click();
      await page
        .getByRole("dialog", { name: "Rename field" })
        .getByRole("textbox")
        .fill("x".repeat(301));
      await userEvent.keyboard("{Enter}");

      await expect
        .element(page.getByTestId("prompt-dialog-error"))
        .toHaveTextContent("Name must be 300 characters or fewer.");
      expect(store.calls).not.toContain("RenameField");
    });

    it("Shows the rule message when renaming to a name in use", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Summary");
        appStore.customFields.addFieldSeed("Effort", "Number");
      });

      await fieldRow("Effort").getByTestId("field-rename").click();
      await userEvent.keyboard("{Control>}a{/Control}summary{Enter}");

      await dismissValidation("Field name is already visible in this project.");
      await expect.element(fieldRow("Effort")).toBeVisible();
      expect(store.customFields.fieldNames(null)).toEqual(["Summary", "Effort"]);
    });

    it("Saves a new type for an unused field and opens the panel when it becomes a choice field", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort");
        appStore.customFields.addFieldSeed("Status");
      });

      await chooseOption(fieldRow("Effort").getByTestId("field-type"), "Number");

      await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Number");
      await expect
        .element(fieldRow("Effort").getByTestId("field-type"))
        .toHaveTextContent("Number");

      await chooseOption(fieldRow("Status").getByTestId("field-type"), "Choice");

      await expect.element(choicesToggle("Status")).toHaveAttribute("aria-expanded", "true");
      expect(store.customFields.fieldNamed("Status").dataType).toBe("Choice");
    });

    it("Changes a type with the keyboard", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort");
      });
      const trigger = fieldRow("Effort").getByTestId("field-type");
      trigger.element().focus();

      await userEvent.keyboard("{Enter}");
      await expect.element(page.getByRole("option", { name: "Text", exact: true })).toHaveFocus();
      await userEvent.keyboard("{ArrowDown}{Enter}");

      await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Number");
      await expect.element(trigger).toHaveTextContent("Number");
    });

    it("Refuses a type change for a field with values and shows the saved type again", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Text", { hasValues: true });
      });

      await chooseOption(fieldRow("Effort").getByTestId("field-type"), "Number");

      await dismissValidation("A field with values cannot change type.");
      await expect.element(fieldRow("Effort").getByTestId("field-type")).toHaveTextContent("Text");
      expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
    });

    it("Reorders fields with the move buttons and disables them at the ends", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("First");
        appStore.customFields.addFieldSeed("Second");
        appStore.customFields.addFieldSeed("Third");
      });

      await expect.element(fieldRow("First").getByTestId("field-move-up")).toBeDisabled();
      await expect.element(fieldRow("Third").getByTestId("field-move-down")).toBeDisabled();
      await fieldRow("First").getByTestId("field-move-down").click();

      await expect.element(fieldRows().nth(0)).toHaveAccessibleName("Second");
      expect(store.customFields.fieldNames(null)).toEqual(["Second", "First", "Third"]);

      await fieldRow("Third").getByTestId("field-move-up").click();

      await expect.element(fieldRows().nth(1)).toHaveAccessibleName("Third");
      expect(store.customFields.fieldNames(null)).toEqual(["Second", "Third", "First"]);
    });

    it("Ignores a second Move down click while the first field move is still saving", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("First");
        appStore.customFields.addFieldSeed("Second");
        appStore.customFields.addFieldSeed("Third");
      });
      const moveDown = () => fieldRow("First").getByTestId("field-move-down");

      await moveDown().dblClick();

      await expect.element(fieldRows().nth(1)).toHaveAccessibleName("First");
      await expect.element(moveDown()).not.toHaveAttribute("aria-disabled", "true");
      expect(store.calls.filter((call) => call === "ReorderFields")).toHaveLength(1);
      expect(store.customFields.fieldNames(null)).toEqual(["Second", "First", "Third"]);
    });

    it("Passes archived fields when reordering and skips over them", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("First");
        appStore.customFields.addFieldSeed("Hidden", "Text", { isArchived: true });
        appStore.customFields.addFieldSeed("Third");
      });

      await fieldRow("First").getByTestId("field-move-down").click();

      await expect.element(fieldRows().nth(0)).toHaveAccessibleName("Third");
      expect(store.customFields.fieldNames(null, true)).toEqual(["Third", "Hidden", "First"]);
    });

    it("Reorders a focused field with Alt+ArrowUp and Alt+ArrowDown and keeps focus", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("First");
        appStore.customFields.addFieldSeed("Second");
        appStore.customFields.addFieldSeed("Third");
      });
      fieldRow("Third").element().focus();

      await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

      await expect.element(fieldRows().nth(1)).toHaveAccessibleName("Third");
      await expect.element(fieldRow("Third")).toHaveFocus();
      expect(store.customFields.fieldNames(null)).toEqual(["First", "Third", "Second"]);

      await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

      await expect.element(fieldRows().nth(2)).toHaveAccessibleName("Third");
      await expect.element(fieldRow("Third")).toHaveFocus();
      expect(store.customFields.fieldNames(null)).toEqual(["First", "Second", "Third"]);
    });

    it("Reorders fields by dragging the handle onto another row", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("First");
        appStore.customFields.addFieldSeed("Hidden", "Text", { isArchived: true });
        appStore.customFields.addFieldSeed("Second");
        appStore.customFields.addFieldSeed("Third");
      });

      await userEvent.dragAndDrop(
        fieldRow("Third").getByTestId("field-drag-handle"),
        fieldRow("First"),
      );

      await expect.element(fieldRows().nth(0)).toHaveAccessibleName("Third");
      expect(store.customFields.fieldNames(null)).toEqual(["Third", "First", "Second"]);
      expect(store.customFields.fieldNames(null, true)).toEqual([
        "Third",
        "Hidden",
        "First",
        "Second",
      ]);
    });

    it("Archives a field, lists it under Show archived and restores it", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Summary");
        appStore.customFields.addFieldSeed("Effort", "Number");
      });

      await fieldRow("Effort").getByTestId("field-archive").click();

      await expect.element(fieldRow("Effort")).not.toBeInTheDocument();
      expect(store.customFields.fieldNamed("Effort").isArchived).toBe(true);

      await showArchived().click();

      const archived = fieldRow("Effort");
      await expect.element(archived).toHaveAttribute("data-archived", "true");
      await expect.element(archived.getByTestId("field-type")).toBeDisabled();
      await expect.element(archived.getByTestId("field-move-up")).toBeDisabled();
      await expect.element(archived.getByTestId("field-move-down")).toBeDisabled();
      await expect.element(fieldRow("Summary").getByTestId("field-move-down")).toBeDisabled();

      await archived.getByTestId("field-restore").click();

      await expect.element(fieldRow("Effort")).not.toHaveAttribute("data-archived", "true");
      expect(store.customFields.fieldNamed("Effort").isArchived).toBe(false);

      await fieldRow("Effort").getByTestId("field-archive").click();
      await showArchived().click();
      await expect.element(fieldRow("Effort")).not.toBeInTheDocument();
    });

    it("Keeps a field archived when its name is now taken", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number", { isArchived: true });
        appStore.customFields.addFieldSeed("effort");
      });
      await showArchived().click();

      await fieldRow("Effort").getByTestId("field-restore").click();

      await dismissValidation("Field name is already visible in this project.");
      await expect.element(fieldRow("Effort")).toHaveAttribute("data-archived", "true");
      expect(store.customFields.fieldNamed("Effort").isArchived).toBe(true);
    });

    it("Shows the server message when the field disappeared elsewhere", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
      });
      store.customFields.removeField(store.customFields.fieldNamed("Effort").id);

      await fieldRow("Effort").getByTestId("field-archive").click();

      await dismissValidation("Field was not found.");
    });

    it("Shows a retryable load failure", async () => {
      const { store } = await renderApp({
        path: "/settings",
        configure: (appStore) => {
          appStore.customFields.listFailure = "The database could not be read.";
          appStore.customFields.addFieldSeed("Effort", "Number");
        },
      });
      const failure = page.getByTestId("field-manager-load-failure");
      await expect.element(failure.getByText("The database could not be read.")).toBeVisible();

      store.customFields.listFailure = null;
      await failure.getByTestId("retry-load").click();

      await expect.element(fieldRow("Effort")).toBeVisible();
    });
  });

  describe("choices", () => {
    it("Adds choices with Enter and the Add choice button and clears only that box", async () => {
      const { store } = await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addFieldSeed("Size", "Choice");
      });
      await choicesToggle("Status").click();
      await choicesToggle("Size").click();
      await newChoice("Size").fill("Half typed");

      await newChoice("Status").fill("Ready");
      await userEvent.keyboard("{Enter}");
      await expect.element(choiceRow("Status", "Ready")).toBeVisible();
      await newChoice("Status").fill("Blocked");
      await fieldRow("Status").getByTestId("choice-add").click();

      await expect.element(choiceRow("Status", "Blocked")).toBeVisible();
      const status = store.customFields.fieldNamed("Status");
      expect(store.customFields.choiceLabels(status.id)).toEqual(["Ready", "Blocked"]);
      await expect.element(newChoice("Status")).toHaveValue("");
      await expect.element(newChoice("Size")).toHaveValue("Half typed");
      await expect.element(choicesToggle("Status")).toHaveTextContent("Choices (2)");
    });

    it("Rejects a duplicate choice label and keeps it in the box", async () => {
      const { store } = await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
      });
      await choicesToggle("Status").click();

      await newChoice("Status").fill("ready");
      await userEvent.keyboard("{Enter}");

      await dismissValidation("Choice label is already used by this field.");
      await expect.element(newChoice("Status")).toHaveValue("ready");
      expect(store.customFields.choices).toHaveLength(1);
    });

    it("Ignores a second Move down click while the first choice move is still saving", async () => {
      const { store } = await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
        appStore.customFields.addChoiceSeed(status.id, "Blocked");
        appStore.customFields.addChoiceSeed(status.id, "Done");
      });
      const statusId = store.customFields.fieldNamed("Status").id;
      await choicesToggle("Status").click();
      const moveDown = () => choiceRow("Status", "Ready").getByTestId("choice-move-down");

      await moveDown().dblClick();

      await expect.element(choiceRows("Status").nth(1)).toHaveAccessibleName("Ready");
      await expect.element(moveDown()).not.toHaveAttribute("aria-disabled", "true");
      expect(store.calls.filter((call) => call === "ReorderFieldChoices")).toHaveLength(1);
      expect(store.customFields.choiceLabels(statusId)).toEqual(["Blocked", "Ready", "Done"]);
    });

    it("Keeps the choice rename prompt open with Enter a name when the label is blank", async () => {
      const { store } = await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
      });
      await choicesToggle("Status").click();

      await choiceRow("Status", "Ready").getByTestId("choice-rename").click();
      await userEvent.keyboard("{Control>}a{/Control}{Backspace}{Enter}");

      await expect
        .element(page.getByTestId("prompt-dialog-error"))
        .toHaveTextContent("Enter a name.");
      await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
      expect(store.calls).not.toContain("RenameFieldChoice");
    });

    it("Renames a choice through the prompt", async () => {
      const { store } = await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
      });
      await choicesToggle("Status").click();

      await choiceRow("Status", "Ready").getByTestId("choice-rename").click();
      await expect.element(page.getByRole("dialog", { name: "Rename choice" })).toBeVisible();
      await userEvent.keyboard("{Control>}a{/Control}Done{Enter}");

      await expect.element(choiceRow("Status", "Done")).toBeVisible();
      const status = store.customFields.fieldNamed("Status");
      expect(store.customFields.choiceLabels(status.id)).toEqual(["Done"]);
    });

    it("Reorders choices with buttons, Alt+Arrow keys and dragging, keeping archived ones", async () => {
      const { store } = await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
        appStore.customFields.addChoiceSeed(status.id, "Retired", { isArchived: true });
        appStore.customFields.addChoiceSeed(status.id, "Blocked");
        appStore.customFields.addChoiceSeed(status.id, "Done");
      });
      const statusId = store.customFields.fieldNamed("Status").id;
      await choicesToggle("Status").click();

      await expect
        .element(choiceRow("Status", "Ready").getByTestId("choice-move-up"))
        .toBeDisabled();
      await expect
        .element(choiceRow("Status", "Done").getByTestId("choice-move-down"))
        .toBeDisabled();
      await choiceRow("Status", "Ready").getByTestId("choice-move-down").click();

      await expect.element(choiceRows("Status").nth(0)).toHaveAccessibleName("Blocked");
      expect(store.customFields.choiceLabels(statusId, true)).toEqual([
        "Blocked",
        "Retired",
        "Ready",
        "Done",
      ]);

      choiceRow("Status", "Done").element().focus();
      await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

      await expect.element(choiceRows("Status").nth(1)).toHaveAccessibleName("Done");
      await expect.element(choiceRow("Status", "Done")).toHaveFocus();
      expect(store.customFields.choiceLabels(statusId)).toEqual(["Blocked", "Done", "Ready"]);
      expect(store.customFields.fieldNames(null)).toEqual(["Status"]);

      await userEvent.dragAndDrop(
        choiceRow("Status", "Ready").getByTestId("choice-drag-handle"),
        choiceRow("Status", "Blocked"),
      );

      await expect.element(choiceRows("Status").nth(0)).toHaveAccessibleName("Ready");
      expect(store.customFields.choiceLabels(statusId, true)).toEqual([
        "Ready",
        "Retired",
        "Blocked",
        "Done",
      ]);
    });

    it("Archives a choice, lists it under Show archived and restores it", async () => {
      const { store } = await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
        appStore.customFields.addChoiceSeed(status.id, "Retired");
      });
      const statusId = store.customFields.fieldNamed("Status").id;
      await choicesToggle("Status").click();

      await choiceRow("Status", "Retired").getByTestId("choice-archive").click();

      await expect.element(choiceRow("Status", "Retired")).not.toBeInTheDocument();
      await expect.element(choicesToggle("Status")).toHaveTextContent("Choices (1)");
      expect(store.customFields.choiceLabels(statusId)).toEqual(["Ready"]);

      await showArchived().click();

      const archived = choiceRow("Status", "Retired");
      await expect.element(archived).toHaveAttribute("data-archived", "true");
      await expect.element(choicesToggle("Status")).toHaveTextContent("Choices (1)");
      await archived.getByTestId("choice-restore").click();

      await expect
        .element(choiceRow("Status", "Retired"))
        .not.toHaveAttribute("data-archived", "true");
      expect(store.customFields.choiceLabels(statusId)).toEqual(["Ready", "Retired"]);
    });

    it("Offers no new choices on an archived field", async () => {
      await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice", { isArchived: true });
        appStore.customFields.addChoiceSeed(status.id, "Ready");
      });
      await showArchived().click();

      await choicesToggle("Status").click();

      await expect.element(choiceRow("Status", "Ready")).toBeVisible();
      await expect.element(newChoice("Status")).not.toBeInTheDocument();
    });

    it("Keeps open panels open and closed panels closed when the list reloads", async () => {
      await openAppSettings((appStore) => {
        appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addFieldSeed("Size", "Choice");
        appStore.customFields.addFieldSeed("Effort", "Number");
      });
      await choicesToggle("Status").click();
      await choicesToggle("Size").click();
      await choicesToggle("Size").click();

      await fieldRow("Effort").getByTestId("field-rename").click();
      await userEvent.keyboard("{Control>}a{/Control}Story points{Enter}");
      await expect.element(fieldRow("Story points")).toBeVisible();

      await expect.element(choicesToggle("Status")).toHaveAttribute("aria-expanded", "true");
      await expect.element(choicesToggle("Size")).toHaveAttribute("aria-expanded", "false");
    });

    it("Counts only active choices in the panel header", async () => {
      await openAppSettings((appStore) => {
        const status = appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addChoiceSeed(status.id, "Ready");
        appStore.customFields.addChoiceSeed(status.id, "Retired", { isArchived: true });
      });

      await expect.element(choicesToggle("Status")).toHaveTextContent("Choices (1)");
      await expect.element(choicesToggle("Status")).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("in Project Settings", () => {
    it("Lists the project's own fields and only active global fields as inherited", async () => {
      await openProjectSettings((appStore, projectId) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
        appStore.customFields.addFieldSeed("Retired", "Text", { isArchived: true });
        appStore.customFields.addFieldSeed("Project note", "Text", { projectId });
        appStore.add({ name: "Other" });
        const otherId = appStore.summaries[1]!.project.id;
        appStore.customFields.addFieldSeed("Elsewhere", "Text", { projectId: otherId });
      });

      await expect
        .element(manager().getByRole("heading", { name: "Project custom fields" }))
        .toBeVisible();
      await expect.element(fieldRows()).toHaveLength(1);
      await expect.element(fieldRows().nth(0)).toHaveAccessibleName("Project note");
      const inherited = manager().getByTestId("field-inherited");
      await expect.element(inherited.getByText("Global fields (inherited)")).toBeVisible();
      await expect.element(inherited.getByTestId("field-inherited-row")).toHaveLength(1);
      await expect
        .element(inherited.getByRole("listitem", { name: "Effort" }).getByText("Number"))
        .toBeVisible();
    });

    it("Adds a project field with typed input", async () => {
      const { store, projectId } = await openProjectSettings();

      await addField("Project note", "enter");

      await expect.element(fieldRow("Project note")).toBeVisible();
      expect(store.customFields.fieldNamed("Project note").projectId).toBe(projectId);
      expect(store.customFields.fieldNames(null)).toEqual([]);
    });

    it("Rejects a project field named like an inherited global field", async () => {
      const { store, projectId } = await openProjectSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
      });

      await addField("EFFORT", "button");

      await dismissValidation("Field name is already visible in this project.");
      expect(store.customFields.fieldNames(projectId)).toEqual([]);
    });

    it("Moves a project field without changing the global order", async () => {
      const { store, projectId } = await openProjectSettings((appStore, id) => {
        appStore.customFields.addFieldSeed("Global one");
        appStore.customFields.addFieldSeed("Global two");
        appStore.customFields.addFieldSeed("Mine one", "Text", { projectId: id });
        appStore.customFields.addFieldSeed("Mine two", "Text", { projectId: id });
      });

      await fieldRow("Mine one").getByTestId("field-move-down").click();

      await expect.element(fieldRows().nth(0)).toHaveAccessibleName("Mine two");
      expect(store.customFields.fieldNames(projectId)).toEqual(["Mine two", "Mine one"]);
      expect(store.customFields.fieldNames(null)).toEqual(["Global one", "Global two"]);
    });

    it("Shows a renamed global field as inherited after editing it in App Settings", async () => {
      const { history, projectId } = await openProjectSettings((appStore) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
      });
      const inherited = () => manager().getByTestId("field-inherited");
      await expect.element(inherited().getByRole("listitem", { name: "Effort" })).toBeVisible();

      history.push("/settings");
      await fieldRow("Effort").getByTestId("field-rename").click();
      await userEvent.keyboard("{Control>}a{/Control}Story points{Enter}");
      await expect.element(fieldRow("Story points")).toBeVisible();
      history.push(`/projects/${projectId}/settings`);

      await expect
        .element(inherited().getByRole("listitem", { name: "Story points" }))
        .toBeVisible();
    });
  });

  it("Lists only global fields without an inherited section in App Settings", async () => {
    await openAppSettings((appStore) => {
      appStore.add({ name: "Billing DB" });
      appStore.customFields.addFieldSeed("Effort", "Number");
      appStore.customFields.addFieldSeed("Project note", "Text", {
        projectId: appStore.summaries[0]!.project.id,
      });
    });

    await expect.element(manager().getByText(/^Available in every project\./)).toBeVisible();
    await expect.element(fieldRows()).toHaveLength(1);
    await expect.element(fieldRows().nth(0)).toHaveAccessibleName("Effort");
    await expect.element(manager().getByTestId("field-inherited")).not.toBeInTheDocument();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed global field manager baseline", async () => {
      await openAppSettings(seedGlobalBaselineFields);
      await choicesToggle("Status").click();
      await expect.element(choiceRow("Status", "Blocked")).toBeVisible();

      await settleTheme(theme);

      await expect.element(manager()).toMatchScreenshot(`field-manager-global-${theme}`);
    });

    it("Matches the reviewed archived field manager baseline", async () => {
      await openAppSettings(seedGlobalBaselineFields);
      await showArchived().click();
      await choicesToggle("Status").click();
      await expect.element(choiceRow("Status", "Retired")).toBeVisible();
      await expect.element(fieldRow("Legacy code")).toBeVisible();

      await settleTheme(theme);

      await expect.element(manager()).toMatchScreenshot(`field-manager-archived-${theme}`);
    });

    it("Matches the reviewed project field manager baseline", async () => {
      await openProjectSettings((appStore, projectId) => {
        appStore.customFields.addFieldSeed("Effort", "Number");
        appStore.customFields.addFieldSeed("Status", "Choice");
        appStore.customFields.addFieldSeed("Customer", "Text", { projectId });
        appStore.customFields.addFieldSeed("Go-live", "Date", { projectId });
      });
      await expect.element(manager().getByTestId("field-inherited-row").nth(1)).toBeVisible();

      await settleTheme(theme);

      await expect.element(manager()).toMatchScreenshot(`field-manager-project-${theme}`);
    });
  });
});
