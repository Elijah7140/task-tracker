import type { Page } from "playwright";
import { expect } from "vitest";
import { type DesktopFixture, desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  chooseMenuCommand,
  createProject,
  expectGone,
  itemRow,
  localDate,
  openItemEditor,
  openProject,
  saveItemEditor,
} from "./support/workflows.js";

const escapeRegExp = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A calendar entry by its title; its accessible name continues with timing and urgency. */
function entry(page: Page, title: string) {
  return page
    .getByTestId("calendar-page")
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}(,|$)`) });
}

/** The month grid's cell for a `YYYY-MM-DD` date. */
function monthCell(page: Page, date: string) {
  return page.locator(`[data-testid="calendar-month-cell"][data-date="${date}"]`);
}

/** Whether the month cell for the date lists the entry. */
async function isInCell(page: Page, title: string, date: string) {
  const cell = monthCell(page, date);
  return (
    (await cell
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}(,|$)`) })
      .count()) === 1
  );
}

/** Opens the calendar from the open project's workspace, which starts in project scope. */
async function openCalendar(page: Page) {
  await chooseMenuCommand(page, "view", "menu-calendar");
  await page.getByTestId("calendar-month-grid").waitFor();
}

/** Sets an editor date or date-time field of an item and saves. */
async function setDateField(page: Page, title: string, label: string, value: string) {
  const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
  await editor.getByLabel(label, { exact: true }).fill(value);
  await saveItemEditor(editor);
}

/** Reads the due date in the editor of the item the calendar opened, then closes it. */
async function openedDueDate(page: Page, title: string) {
  const row = itemRow(page, SMOKE_PROJECT, title);
  await expect.poll(() => row.getAttribute("aria-selected")).toBe("true");
  const editor = await openItemEditor(page, row);
  const due = await editor.getByLabel("Due date", { exact: true }).inputValue();
  await page.keyboard.press("Escape");
  await expectGone(editor);
  return due;
}

/** Creates a project with one item due today and opens the project's month calendar. */
async function openCalendarWithDueItem(page: Page, title: string) {
  await createProject(page);
  await openProject(page);
  await addItem(page, SMOKE_PROJECT, title);
  await setDateField(page, title, "Due date", localDate(0));
  await openCalendar(page);
  await expect.poll(() => isInCell(page, title, localDate(0))).toBe(true);
}

/** Relaunches, opens the project's calendar and checks the entry's day and stored due date. */
async function expectMovedAfterRelaunch(desktop: DesktopFixture, title: string, date: string) {
  await withDesktop(desktop, async (page) => {
    await openProject(page);
    await openCalendar(page);
    await expect.poll(() => isInCell(page, title, date)).toBe(true);
    await entry(page, title).click();

    expect(await openedDueDate(page, title)).toBe(date);
  });
}

desktopTest(
  "Calendar shows due and scheduled items in month and week, opens one, and shows them after relaunch",
  async ({ desktop }) => {
    const due = "Calendar due item";
    const scheduled = "Calendar scheduled item";
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, due);
      await setDateField(page, due, "Due date", localDate(0));
      await addItem(page, SMOKE_PROJECT, scheduled);
      await setDateField(page, scheduled, "Scheduled start", `${localDate(0)}T00:00`);

      await openCalendar(page);
      expect(await page.getByTestId("calendar-scope").innerText()).toContain("This project");
      await expect.poll(() => isInCell(page, due, localDate(0))).toBe(true);
      expect(await isInCell(page, scheduled, localDate(0))).toBe(true);
      await page.getByTestId("calendar-next").click();
      await page.getByTestId("calendar-previous").click();
      await page.getByTestId("calendar-today").click();
      await expect.poll(() => isInCell(page, due, localDate(0))).toBe(true);
      await page.getByTestId("calendar-view-week").click();
      await page.getByTestId("calendar-week-grid").waitFor();
      await entry(page, due).waitFor();
      await entry(page, scheduled).waitFor();
      await entry(page, due).click();

      await expectGone(page.getByTestId("calendar-page"));
      await expect
        .poll(() => itemRow(page, SMOKE_PROJECT, due).getAttribute("aria-selected"))
        .toBe("true");
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      await openCalendar(page);

      await expect.poll(() => isInCell(page, due, localDate(0))).toBe(true);
      expect(await isInCell(page, scheduled, localDate(0))).toBe(true);
    });
  },
);

desktopTest(
  "A calendar entry moves with Alt+Right and the item keeps the new due date after relaunch",
  async ({ desktop }) => {
    const title = "Keyboard move item";
    await withDesktop(desktop, async (page) => {
      await openCalendarWithDueItem(page, title);

      await entry(page, title).focus();
      await page.keyboard.press("Alt+ArrowRight");
      await expect.poll(() => isInCell(page, title, localDate(1))).toBe(true);
      await page.keyboard.press("Alt+ArrowRight");
      await expect.poll(() => isInCell(page, title, localDate(2))).toBe(true);
      await entry(page, title).click();

      expect(await openedDueDate(page, title)).toBe(localDate(2));
    });

    await expectMovedAfterRelaunch(desktop, title, localDate(2));
  },
);

desktopTest(
  "A calendar entry moves with a real mouse drag and the item keeps the new due date after relaunch",
  async ({ desktop }) => {
    const title = "Mouse move item";
    await withDesktop(desktop, async (page) => {
      await openCalendarWithDueItem(page, title);
      const from = await entry(page, title).boundingBox();
      const to = await monthCell(page, localDate(2)).boundingBox();
      if (from === null || to === null) {
        throw new Error("The entry or its target day is not on screen.");
      }

      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.mouse.up();

      await expect.poll(() => isInCell(page, title, localDate(2))).toBe(true);
      await entry(page, title).click();
      expect(await openedDueDate(page, title)).toBe(localDate(2));
    });

    await expectMovedAfterRelaunch(desktop, title, localDate(2));
  },
);
