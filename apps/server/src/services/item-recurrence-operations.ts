import { FloatingTime, skipOccurrence, stopRepeating } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { itemRepository } from "../db/repositories/item-repository.js";
import { checkRules } from "./check-rules.js";
import { operationTime } from "./operation-time.js";
import { type UndoService, undoLabel } from "./undo-service.js";

/** "Skip this one" and "Stop repeating" (§7.11), each one undoable transaction. */
export function itemRecurrenceOperations(
  sql: SqlClient.SqlClient,
  undo: UndoService["Service"],
  timeZone: string,
) {
  const items = itemRepository(sql);
  const itemRow = (id: string) => [{ table: "TodoItem" as const, where: sql`Id = ${id}` }];

  /** Moves an open occurrence to its next date. False means the rule has no next date. */
  const skip = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    const now = yield* operationTime;
    const today = FloatingTime.toFloating(now, timeZone).toPlainDate();
    const skipped = yield* checkRules(() => skipOccurrence(item, today, now));
    if (skipped === null) {
      return false;
    }
    yield* undo.capture(undoLabel("Skip repeat for", item.title), itemRow(item.id));
    yield* items.updateDates(skipped);
    yield* items.saveRecurrence(skipped);
    return true;
  }, undo.record);

  /** Removes the rule and series from this occurrence only. */
  const stop = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    const now = yield* operationTime;
    yield* undo.capture(undoLabel("Stop repeating", item.title), itemRow(item.id));
    yield* items.saveRecurrence(stopRepeating(item, now));
  }, undo.record);

  return { skipRepeat: skip, stopRepeating: stop };
}
