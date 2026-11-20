import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import type { ElectronApplication, Locator, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  chooseMenuCommand,
  createProject,
  expectGone,
  itemRow,
  openItemEditor,
  openProject,
  remindersMenuLabel,
  saveItemEditor,
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

interface NotificationState {
  shown: Electron.Notification[];
}
type NotificationTestGlobal = typeof globalThis & { desktopNotificationState: NotificationState };

/**
 * Records native notifications instead of showing them. The OS toast is outside
 * Playwright's reach, so the test reads what main asked for and clicks it.
 */
async function observeNotifications(application: ElectronApplication) {
  await application.evaluate(({ Notification }) => {
    const state: NotificationState = { shown: [] };
    (globalThis as NotificationTestGlobal).desktopNotificationState = state;
    Notification.isSupported = () => true;
    Notification.prototype.show = function (this: Electron.Notification) {
      state.shown.push(this);
    };
  });
  return {
    read: () =>
      application.evaluate(() =>
        (globalThis as NotificationTestGlobal).desktopNotificationState.shown.map(
          ({ title, body }) => ({ title, body }),
        ),
      ),
    click: (index: number) =>
      application.evaluate((_electron, position) => {
        const shown = (globalThis as NotificationTestGlobal).desktopNotificationState.shown;
        shown[position]?.emit("click", {});
      }, index),
  };
}

/** Gives the item a due time at the current minute and a reminder at the due moment. */
async function makeDueNow(page: Page, title: string) {
  const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
  const due = dueNow();
  await editor.getByLabel("Due date", { exact: true }).fill(due.date);
  await editor.getByLabel("Due time", { exact: true }).fill(due.time);
  await pick(page, editor.getByRole("combobox", { name: "Reminder" }), "At the due moment");
  await saveItemEditor(editor);
}

desktopTest(
  "Shows a native notification for a due reminder and opens the item when it is clicked",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page, application) => {
      const notifications = await observeNotifications(application);
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, REMINDER_ITEM);

      await makeDueNow(page, REMINDER_ITEM);
      await expect
        .poll(notifications.read)
        .toEqual([{ title: REMINDER_ITEM, body: SMOKE_PROJECT }]);
      await page.getByTestId("sidebar-home").click();
      await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor();
      await notifications.click(0);

      const editor = page.getByRole("dialog", { name: "Edit item" });
      await expect
        .poll(() => editor.getByTestId("item-editor-title").inputValue())
        .toBe(REMINDER_ITEM);
      await page.keyboard.press("Escape");
      await expectGone(editor);
      expect(await remindersMenuLabel(page)).toBe("Reminders (1)");
    });
  },
);

/**
 * Makes the item due now behind the server's back, as an outside change would.
 * No recorded operation commits, so only a requested check or the hourly
 * fallback can find it.
 */
function makeDueNowOutsideTheApp(database: string, title: string) {
  using connection = new DatabaseSync(database, { timeout: 5_000 });
  const due = dueNow();
  connection
    .prepare(
      `UPDATE TodoItem SET DueDate = ?, DueTime = ?, ReminderMode = 2, ReminderOffsetMinutes = 0
       WHERE Title = ?`,
    )
    .run(due.date, `${due.time}:00`, title);
}

desktopTest("A resume from sleep checks reminders at once", async ({ desktop }) => {
  await withDesktop(desktop, async (page, application) => {
    const notifications = await observeNotifications(application);
    await createProject(page);
    await openProject(page);
    await addItem(page, SMOKE_PROJECT, REMINDER_ITEM);

    makeDueNowOutsideTheApp(desktop.database, REMINDER_ITEM);
    await delay(2_000);
    const beforeResume = await notifications.read();
    await application.evaluate(({ powerMonitor }) => powerMonitor.emit("resume"));

    expect(beforeResume).toEqual([]);
    await expect.poll(notifications.read).toEqual([{ title: REMINDER_ITEM, body: SMOKE_PROJECT }]);
  });
});

desktopTest(
  "Shows a reminder due now in the in-app panel and does not deliver it again after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, REMINDER_ITEM);
      await makeDueNow(page, REMINDER_ITEM);

      await expect.poll(() => remindersMenuLabel(page)).toBe("Reminders (1)");
      await chooseMenuCommand(page, "view", "menu-reminders");
      const panel = page.getByTestId("reminders-panel");
      await panel.getByRole("group", { name: REMINDER_ITEM }).waitFor();
      await panel.getByTestId("reminder-dismiss").click();
      await panel.getByTestId("reminders-empty").waitFor();
    });

    await withDesktop(desktop, async (page) => {
      await page.getByTestId("new-project-button").waitFor();

      expect(await remindersMenuLabel(page)).toBe("Reminders");
    });
  },
);
