import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  addItem,
  createProject,
  itemRow,
  openItemEditor,
  openProject,
  saveItemEditor,
  SMOKE_PROJECT,
} from "./support/workflows.js";

const REMINDER_ITEM = "Call the supplier";

async function pick(page: Page, control: Locator, option: string) {
  await control.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/**
 * The packaged app schedules on the real clock in the OS zone, so the test reads
 * that clock too. The item is due at the current local minute, which has begun.
 */
function dueNow() {
  const format = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    format.formatToParts(Date.now()).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

desktopTest(
  "Shows a reminder due now in the in-app panel and does not deliver it again after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, REMINDER_ITEM);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, REMINDER_ITEM));
      const due = dueNow();
      await editor.getByLabel("Due date", { exact: true }).fill(due.date);
      await editor.getByLabel("Due time", { exact: true }).fill(due.time);
      await pick(page, editor.getByRole("combobox", { name: "Reminder" }), "At the due moment");
      await saveItemEditor(editor);

      const bell = page.getByTestId("reminder-bell");
      await expect.poll(() => bell.getAttribute("aria-label")).toBe("Reminders (1)");
      await bell.click();
      const panel = page.getByTestId("reminders-panel");
      await panel.getByRole("group", { name: REMINDER_ITEM }).waitFor();
      await panel.getByTestId("reminder-dismiss").click();
      await panel.getByTestId("reminders-empty").waitFor();
    });

    await withDesktop(desktop, async (page) => {
      await page.getByTestId("reminder-bell").waitFor();
      await page.getByTestId("new-project-button").waitFor();

      expect(await page.getByTestId("reminder-bell").getAttribute("aria-label")).toBe("Reminders");
    });
  },
);
