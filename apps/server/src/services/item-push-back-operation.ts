import { pushBackOneDay } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { itemRepository } from "../db/repositories/item-repository.js";
import { checkRules } from "./check-rules.js";
import { operationTime } from "./operation-time.js";
import { type UndoService, undoLabel } from "./undo-service.js";

/**
 * "Push back one day" (§7.14) as one undoable transaction. It validates the
 * latest stored row and moves only that item's floating dates, so its
 * sub-items, repeat rule and series stay as they are.
 */
export function itemPushBackOperation(sql: SqlClient.SqlClient, undo: UndoService["Service"]) {
  const items = itemRepository(sql);

  const pushBack = Effect.fnUntraced(function* (id: string) {
    const item = yield* items.requireActive(id);
    const now = yield* operationTime;
    const moved = yield* checkRules(() => pushBackOneDay(item, now));
    yield* undo.capture(undoLabel("Push back", item.title), [
      { table: "TodoItem", where: sql`Id = ${item.id}` },
    ]);
    yield* items.updateDates(moved);
  }, undo.record);

  return { pushBackOneDay: pushBack };
}
