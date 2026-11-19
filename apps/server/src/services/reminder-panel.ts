import { Deferred, Effect } from "effect";
import type { ReminderEntry } from "../db/repositories/reminder-repository.js";

/** The panel's reminders, newest first, and a version that changes with them. */
export interface ReminderPanelState {
  readonly version: number;
  readonly reminders: readonly ReminderEntry[];
}

const sameEntry = (left: ReminderEntry, right: ReminderEntry) =>
  left.itemId === right.itemId &&
  left.instant.equals(right.instant) &&
  left.title === right.title &&
  left.projectName === right.projectName &&
  left.projectId === right.projectId &&
  left.folderId === right.folderId;

/**
 * The session's list of delivered reminders (§7.12). It remembers which items it
 * has shown, so undoing a snooze brings an entry back, while Dismiss forgets the
 * item for the session. Watchers wait for the next version.
 */
export const makeReminderPanel = Effect.gen(function* () {
  let rows: readonly ReminderEntry[] = [];
  const known = new Set<string>();
  let version = 0;
  let changed = yield* Deferred.make<void>();

  const publish = (next: readonly ReminderEntry[]) =>
    Effect.gen(function* () {
      const same =
        next.length === rows.length && next.every((entry, index) => sameEntry(entry, rows[index]!));
      if (same) {
        return;
      }
      rows = next;
      version += 1;
      const previous = changed;
      changed = yield* Deferred.make<void>();
      yield* Deferred.succeed(previous, undefined);
    });

  /** Puts entries at the top in their order, replacing any older entry for the same item. */
  const add = (entries: readonly ReminderEntry[]) =>
    Effect.suspend(() => {
      entries.forEach((entry) => known.add(entry.itemId));
      const ids = new Set(entries.map((entry) => entry.itemId));
      return publish([...entries, ...rows.filter((row) => !ids.has(row.itemId))]);
    });

  /**
   * Keeps rows that are still delivered and unchanged, then adds known items that
   * are delivered again but not shown, such as after undoing their snooze.
   */
  const reconcile = (delivered: readonly ReminderEntry[]) =>
    Effect.suspend(() => {
      const current = new Map(delivered.map((entry) => [entry.itemId, entry]));
      const kept = rows.filter((row) => {
        const entry = current.get(row.itemId);
        return entry !== undefined && sameEntry(entry, row);
      });
      const shown = new Set(kept.map((row) => row.itemId));
      const restored = delivered.filter(
        (entry) => known.has(entry.itemId) && !shown.has(entry.itemId),
      );
      return publish([...restored, ...kept]);
    });

  /** Removes an item's entry, and with `forget` stops restoring it this session. */
  const remove = (itemId: string, forget: boolean) =>
    Effect.suspend(() => {
      if (forget) {
        known.delete(itemId);
      }
      return publish(rows.filter((row) => row.itemId !== itemId));
    });

  /** The current state once its version differs from `afterVersion`. */
  const watch = (afterVersion: number): Effect.Effect<ReminderPanelState> =>
    Effect.suspend(() =>
      version === afterVersion
        ? Effect.andThen(Deferred.await(changed), watch(afterVersion))
        : Effect.succeed({ version, reminders: rows }),
    );

  return {
    add,
    reconcile,
    remove,
    watch,
    /** Item IDs the panel would restore. */
    knownItemIds: () => [...known],
  };
});

/** One session's reminder panel. */
export type ReminderPanel = Effect.Success<typeof makeReminderPanel>;
