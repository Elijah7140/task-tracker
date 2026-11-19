/** What a notification needs to name one reminder. */
export interface ReminderSummary {
  readonly itemId: string;
  readonly title: string;
  readonly projectName: string;
}

/** A platform notification. A null item opens the reminders panel. */
export interface ReminderNotice {
  readonly title: string;
  readonly body: string;
  readonly itemId: string | null;
}

const GROUPED_BODY = "Open Task Tracker to see your reminders.";

/**
 * Only reminders from the last 24 hours notify; older ones are recorded
 * silently. The window includes its lower boundary (§7.12).
 */
export function recentReminderCutoff(now: Temporal.Instant): Temporal.Instant {
  return now.subtract({ hours: 24 });
}

/**
 * One reminder found by a live check names its item. Several, or anything
 * missed while the app was closed, become one grouped notification.
 */
export function reminderNotification(
  entries: readonly ReminderSummary[],
  startup: boolean,
): ReminderNotice {
  const [first] = entries;
  if (!startup && entries.length === 1 && first !== undefined) {
    return { title: first.title, body: first.projectName, itemId: first.itemId };
  }
  const count = entries.length === 1 ? "1 reminder" : `${entries.length} reminders`;
  const title = startup ? `${count} while you were away` : `${count} due`;
  return { title, body: GROUPED_BODY, itemId: null };
}
