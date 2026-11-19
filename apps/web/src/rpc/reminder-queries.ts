import { TaskTrackerClient } from "./task-tracker-client.js";

/**
 * The reminders panel once its version differs from `afterVersion`. The server
 * holds the request until the scheduler or a panel action changes the panel, so
 * the renderer needs no timer (§7.12). Pass -1 to read at once.
 */
export const watchRemindersAtom = (afterVersion: number) =>
  TaskTrackerClient.query("WatchReminders", { afterVersion });

/** Defers a delivered reminder as one undo step. */
export const snoozeReminderAtom = TaskTrackerClient.mutation("SnoozeReminder");

/** Removes a reminder from this session's panel. */
export const dismissReminderAtom = TaskTrackerClient.mutation("DismissReminder");
