import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  EDITOR_ITEM,
  editor,
  openEditor,
  openEditorWorkspace,
} from "../support/item-editor-page.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";

const dueDate = () => editor().getByTestId("item-editor-due-date");
const pickerButton = () => editor().getByTestId("item-editor-due-date-picker");
const popup = () => page.getByTestId("date-picker");
const day = (name: string) => popup().getByRole("button", { name, exact: true });
const clearButton = () => editor().getByTestId("item-editor-clear-due-date");

/** Opens the editor on an item due 20 November 2026 with the clock on 23 November. */
async function openDueDate(now = "2026-11-23T12:00:00Z") {
  const testClock = createTestClock();
  await testClock.setTime(now);
  const app = await openEditorWorkspace({ clock: testClock.clock });
  await openEditor();
  const stored = () => app.store.findItemByTitle(app.projectId, null, EDITOR_ITEM)?.item;
  return { ...app, testClock, stored };
}

describe("Date field", () => {
  it("Opens a calendar on the due date's month with the due date and today marked", async () => {
    await openDueDate();

    await pickerButton().click();

    await expect.element(popup()).toBeVisible();
    await expect.element(popup().getByRole("grid")).toHaveAccessibleName("November 2026");
    const selected = day("Friday, November 20, 2026");
    await expect.element(selected).toHaveAttribute("data-selected", "true");
    await expect.element(selected).toHaveFocus();
    const today = day("Monday, November 23, 2026");
    await expect.element(today).toHaveAttribute("aria-current", "date");
    await expect.element(today).not.toHaveAttribute("data-selected");
  });

  it("Names the calendar button after the field", async () => {
    await openDueDate();

    await expect.element(pickerButton()).toHaveAccessibleName("Choose due date");
  });

  it("Sets the date from a clicked day and returns focus to the button", async () => {
    const { stored } = await openDueDate();
    await pickerButton().click();

    await page.getByRole("button", { name: "Next month" }).click();
    await day("Wednesday, December 16, 2026").click();

    await expect.element(popup()).not.toBeInTheDocument();
    await expect.element(dueDate()).toHaveValue("2026-12-16");
    await expect.element(pickerButton()).toHaveFocus();
    await editor().getByTestId("item-editor-save").click();
    expect(stored()?.dueDate).toBe("2026-12-16");
  });

  it("Chooses a date with the keyboard and closes on Escape without closing the editor", async () => {
    await openDueDate();
    await pickerButton().click();
    await expect.element(day("Friday, November 20, 2026")).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}{ArrowRight}{Enter}");

    await expect.element(dueDate()).toHaveValue("2026-11-28");
    await expect.element(pickerButton()).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    await expect.element(day("Saturday, November 28, 2026")).toHaveFocus();
    await userEvent.keyboard("{PageDown}{Escape}");

    await expect.element(popup()).not.toBeInTheDocument();
    await expect.element(editor()).toBeVisible();
    await expect.element(pickerButton()).toHaveFocus();
    await expect.element(dueDate()).toHaveValue("2026-11-28");
  });

  it("Opens on today's month when the date is empty and picks today with the Today button", async () => {
    await openDueDate();
    await clearButton().click();
    await expect.element(dueDate()).toHaveValue("");

    await pickerButton().click();
    await expect.element(day("Monday, November 23, 2026")).toHaveFocus();
    await page.getByTestId("date-picker-today").click();

    await expect.element(dueDate()).toHaveValue("2026-11-23");
    await expect.element(clearButton()).toBeEnabled();
  });

  it("Reads today from the renderer clock each time the calendar opens", async () => {
    const { testClock } = await openDueDate("2026-11-23T23:59:00Z");
    await testClock.advance("2 minutes");

    await pickerButton().click();
    await page.getByTestId("date-picker-today").click();

    await expect.element(dueDate()).toHaveValue("2026-11-24");
  });

  it("Accepts a typed date and shows it selected in the calendar", async () => {
    const { stored } = await openDueDate();

    await dueDate().fill("2027-1-5");
    await pickerButton().click();

    await expect.element(popup().getByRole("grid")).toHaveAccessibleName("January 2027");
    await expect.element(day("Tuesday, January 5, 2027")).toHaveAttribute("data-selected", "true");
    await userEvent.keyboard("{Escape}");
    await expect.element(dueDate()).toHaveValue("2027-01-05");
    await editor().getByTestId("item-editor-save").click();
    expect(stored()?.dueDate).toBe("2027-01-05");
  });

  it("Marks text that is not a date invalid and restores the date when focus leaves", async () => {
    await openDueDate();

    await dueDate().fill("2026-02-30");
    await expect.element(dueDate()).toHaveAttribute("aria-invalid", "true");
    await editor().getByLabelText("Ticket number", { exact: true }).click();

    await expect.element(dueDate()).toHaveValue("2026-11-20");
    await expect.element(dueDate()).not.toHaveAttribute("aria-invalid");
  });

  it("Clears the date when the text is deleted or the clear button is pressed", async () => {
    await openDueDate();

    await dueDate().fill("");
    await expect.element(clearButton()).toBeDisabled();
    await dueDate().fill("2026-11-30");
    await expect.element(clearButton()).toBeEnabled();
    await clearButton().click();

    await expect.element(dueDate()).toHaveValue("");
    await expect.element(clearButton()).toBeDisabled();
  });

  it("Picks the date part of a scheduled start and keeps its time", async () => {
    await openDueDate();
    const start = editor().getByTestId("item-editor-scheduled-start");
    await start.fill("2026-11-24T14:30");

    await editor().getByTestId("item-editor-scheduled-start-picker").click();
    await expect.element(day("Tuesday, November 24, 2026")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{Enter}");

    await expect.element(start).toHaveValue("2026-11-25T14:30");
  });

  it("Starts an empty scheduled start at 09:00 on the picked day", async () => {
    await openDueDate();

    await editor().getByTestId("item-editor-scheduled-end-picker").click();
    await page.getByTestId("date-picker-today").click();

    await expect
      .element(editor().getByTestId("item-editor-scheduled-end"))
      .toHaveValue("2026-11-23T09:00");
  });

  it.each(THEMES)("Matches the open date picker baseline in %s", async (theme) => {
    await openDueDate();
    await pickerButton().click();
    await expect.element(popup()).toBeVisible();

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`date-field-open-${theme}`);
  });
});
