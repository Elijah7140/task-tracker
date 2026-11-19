import { type ReminderEntry, type ReminderSnooze, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";

type Entry = typeof ReminderEntry.Type;

/** An item a reminder can be delivered for. */
export interface ReminderItemSource {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly folderId: string | null;
}

/**
 * The session panel behind the fake server (§7.12). A test delivers reminders
 * as the server's scheduler would, and waiting watchers answer at once.
 */
export class FakeReminders {
  version = 0;
  rows: ReadonlyArray<Entry> = [];
  readonly snoozes: Array<{ readonly itemId: string; readonly option: string }> = [];
  /** A refusal the next snooze returns, as when the reminder changed. */
  snoozeRefusal: string | null = null;
  private listeners: Array<() => void> = [];

  /** Puts reminders at the top of the panel, newest first, replacing older ones for the same item. */
  deliver(items: ReadonlyArray<ReminderItemSource>, projectName: string, instantUtc: string) {
    const entries = items.map((item) => ({
      itemId: item.id,
      title: item.title,
      projectId: item.projectId,
      folderId: item.folderId,
      projectName,
      instantUtc,
    }));
    const ids = new Set(entries.map((entry) => entry.itemId));
    this.publish([...entries, ...this.rows.filter((row) => !ids.has(row.itemId))]);
  }

  /** Removes an item's entry. */
  remove(itemId: string) {
    this.publish(this.rows.filter((row) => row.itemId !== itemId.toUpperCase()));
  }

  /** Replaces the panel, as an undone snooze restores its entry. */
  publish(rows: ReadonlyArray<Entry>) {
    this.rows = rows;
    this.version += 1;
    const waiting = this.listeners;
    this.listeners = [];
    waiting.forEach((resume) => resume());
  }

  /** The panel once its version differs from `afterVersion`. */
  watch(afterVersion: number): Effect.Effect<{ version: number; reminders: ReadonlyArray<Entry> }> {
    const current = Effect.sync(() => ({ version: this.version, reminders: this.rows }));
    if (this.version !== afterVersion) {
      return current;
    }
    return Effect.callback<void>((resume) => {
      const listener = () => resume(Effect.void);
      this.listeners.push(listener);
      return Effect.sync(() => {
        this.listeners = this.listeners.filter((candidate) => candidate !== listener);
      });
    }).pipe(Effect.andThen(() => this.watch(afterVersion)));
  }
}

interface ReminderStore {
  readonly reminders: FakeReminders;
  readonly record: (tag: string) => Effect.Effect<unknown>;
}

/** The reminder panel endpoints. Snoozes are labelled for the fake history. */
export function reminderHandlers(
  store: ReminderStore,
  track: <A, E, R>(
    change: Effect.Effect<A, E, R>,
    label: (result: A) => string | null,
  ) => Effect.Effect<A, E, R>,
) {
  const { reminders, record } = store;
  return {
    WatchReminders: ({ afterVersion }: { readonly afterVersion: number }) =>
      reminders.watch(afterVersion),
    SnoozeReminder: ({
      itemId,
      option,
    }: {
      readonly itemId: string;
      readonly instantUtc: string;
      readonly option: typeof ReminderSnooze.Type;
    }) => {
      const title = reminders.rows.find((row) => row.itemId === itemId.toUpperCase())?.title;
      const change = record("SnoozeReminder").pipe(
        Effect.andThen(() => {
          const refusal = reminders.snoozeRefusal;
          if (refusal !== null) {
            reminders.snoozeRefusal = null;
            return Effect.fail(new RuleViolation({ message: refusal }));
          }
          reminders.snoozes.push({ itemId: itemId.toUpperCase(), option });
          reminders.remove(itemId);
          return Effect.void;
        }),
      );
      return track(change, () => `Snooze reminder for '${title}'`);
    },
    DismissReminder: ({ itemId }: { readonly itemId: string }) =>
      record("DismissReminder").pipe(Effect.andThen(Effect.sync(() => reminders.remove(itemId)))),
  };
}
