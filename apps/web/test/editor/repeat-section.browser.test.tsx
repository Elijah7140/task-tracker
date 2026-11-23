import type { RecurrenceRule } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  EDITOR_ITEM,
  editor,
  openEditor,
  openEditorWorkspace,
  pick,
} from "../support/item-editor-page.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

type Rule = typeof RecurrenceRule.Type;

const WEEKLY: Rule = {
  frequency: "Weekly",
  interval: 1,
  weekdays: 16,
  monthDay: null,
  month: null,
  anchor: "DueDate",
  endKind: "Never",
  endDate: null,
  remaining: null,
};

const repeat = () => editor().getByRole("region", { name: "Repeat" });
const summary = () => repeat().getByTestId("item-editor-repeat-summary");
const repeatError = () => repeat().getByTestId("item-editor-repeat-error");
const weekday = (name: string) => repeat().getByRole("button", { name, exact: true });
const textbox = (name: string) => repeat().getByRole("textbox", { name, exact: true });
const saveButton = () => editor().getByTestId("item-editor-save");
const footerError = () => editor().getByTestId("item-editor-error");

async function openRepeat(rule?: Rule) {
  const app = await openEditorWorkspace({
    configure: (store, projectId) => {
      const node = store.findItemByTitle(projectId, null, EDITOR_ITEM);
      if (rule !== undefined) {
        store.patchItem(node!.item.id, { recurrence: rule, recurrenceSeriesId: node!.item.id });
      }
    },
  });
  await openEditor();
  const stored = () => app.store.findItemByTitle(app.projectId, null, EDITOR_ITEM)?.item;
  return { ...app, stored };
}

async function saveAndClose() {
  await saveButton().click();
  await expect.element(editor()).not.toBeInTheDocument();
}

describe("Repeat section", () => {
  it("Starts a weekly rule on the due date's weekday and saves the toggled days", async () => {
    const { stored, store } = await openRepeat();
    await expect
      .element(repeat().getByRole("combobox", { name: "Repeat", exact: true }))
      .toHaveTextContent("Does not repeat");

    await pick("Repeat", "Weekly");
    await expect.element(weekday("Friday")).toHaveAttribute("aria-pressed", "true");
    await expect.element(summary()).toHaveTextContent("Weekly on Fri");
    await weekday("Monday").click();
    await expect.element(summary()).toHaveTextContent("Weekly on Mon, Fri");
    await saveAndClose();

    expect(stored()?.recurrence).toEqual({ ...WEEKLY, weekdays: 1 | 16 });
    expect(store.calls).toContain("EditItem");
  });

  it("Toggles weekdays and edits the interval with the keyboard", async () => {
    const { stored } = await openRepeat(WEEKLY);
    await expect.element(summary()).toHaveTextContent("Weekly on Fri");

    await textbox("Every").click();
    await userEvent.keyboard("{Control>}a{/Control}2{Tab}");
    await expect.element(weekday("Monday")).toHaveFocus();
    await userEvent.keyboard("{Tab}{Tab}{ }");

    await expect.element(weekday("Wednesday")).toHaveAttribute("aria-pressed", "true");
    await expect.element(summary()).toHaveTextContent("Every 2 weeks on Wed, Fri");
    await saveAndClose();
    expect(stored()?.recurrence).toMatchObject({ interval: 2, weekdays: 4 | 16 });
  });

  it("Keeps an invalid day of the month from saving and explains why", async () => {
    const { store } = await openRepeat();
    await pick("Repeat", "Monthly");
    await expect.element(textbox("Day of month")).toHaveValue("20");
    await expect.element(summary()).toHaveTextContent("Monthly on day 20");

    await textbox("Day of month").fill("32");
    await saveButton().click();

    await expect.element(repeatError()).toHaveTextContent("Enter a day of the month from 1 to 31.");
    await expect.element(footerError()).toHaveTextContent("Enter a day of the month from 1 to 31.");
    expect(store.calls).not.toContain("EditItem");
    await repeat().getByRole("checkbox", { name: "Last day of the month" }).click();
    await expect.element(textbox("Day of month")).not.toBeInTheDocument();
    await expect.element(summary()).toHaveTextContent("Monthly on the last day");
  });

  it("Saves an end date or a remaining count", async () => {
    const { stored } = await openRepeat(WEEKLY);

    await pick("Ends", "After a number of occurrences");
    await textbox("Remaining").fill("3");
    await pick("Next date", "From the completion date");
    await saveAndClose();

    expect(stored()?.recurrence).toEqual({
      ...WEEKLY,
      anchor: "CompletionDate",
      endKind: "AfterCount",
      remaining: 3,
    });
  });

  it("Asks for an end date before saving an end on a date", async () => {
    await openRepeat(WEEKLY);

    await pick("Ends", "On a date");

    await expect
      .element(repeatError())
      .toHaveTextContent("An end date is required only when the repeat ends on a date.");
    await repeat().getByTestId("item-editor-repeat-end-date").fill("2026-12-31");
    await expect.element(repeatError()).not.toBeInTheDocument();
  });

  it("Explains that a repeating item needs a date when its due date is cleared", async () => {
    await openRepeat(WEEKLY);

    await editor().getByTestId("item-editor-clear-due-date").click();

    await expect
      .element(repeatError())
      .toHaveTextContent("A repeating item needs a due date or a scheduled start.");
    await saveButton().click();
    await expect
      .element(footerError())
      .toHaveTextContent("A repeating item needs a due date or a scheduled start.");
  });

  it("Choosing Does not repeat removes the rule", async () => {
    const { stored } = await openRepeat(WEEKLY);

    await pick("Repeat", "Does not repeat");
    await expect.element(summary()).not.toBeInTheDocument();
    await saveAndClose();

    expect(stored()?.recurrence).toBeNull();
  });

  it("Skips to the next occurrence and stops repeating from the editor", async () => {
    const { stored } = await openRepeat(WEEKLY);

    await repeat().getByRole("button", { name: "Skip this one" }).click();

    await expect.element(editor().getByTestId("item-editor-due-date")).toHaveValue("11/27/2026");
    expect(stored()?.dueDate).toBe("2026-11-27");
    await repeat().getByRole("button", { name: "Stop repeating" }).click();
    await expect
      .element(repeat().getByRole("button", { name: "Skip this one" }))
      .not.toBeInTheDocument();
    expect(stored()?.recurrence).toBeNull();
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Asks about unsaved changes before skipping", async () => {
    const { store, projectId, itemId } = await openRepeat(WEEKLY);
    const id = itemId(EDITOR_ITEM);
    await editor().getByRole("textbox", { name: "Title" }).fill("Renamed");

    await repeat().getByRole("button", { name: "Skip this one" }).click();
    const question = page.getByRole("alertdialog", { name: "Unsaved changes" });
    await expect.element(question).toBeVisible();
    await question.getByRole("button", { name: "Save" }).click();

    await expect.element(editor().getByTestId("item-editor-due-date")).toHaveValue("11/27/2026");
    expect(store.findItemByTitle(projectId, null, "Renamed")?.item.id).toBe(id);
  });

  it.each(THEMES)("Matches the weekly repeat baseline in %s", async (theme) => {
    await openRepeat({
      ...WEEKLY,
      interval: 2,
      weekdays: 1 | 8,
      endKind: "AfterCount",
      remaining: 4,
    });
    repeat().element().scrollIntoView({ block: "center" });

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`editor-weekly-repeat-${theme}`);
  });
});
