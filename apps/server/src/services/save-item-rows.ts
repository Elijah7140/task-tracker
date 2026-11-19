import type { ItemTree, TodoItem } from "@task-tracker/core";
import { Effect } from "effect";
import type { itemRepository } from "../db/repositories/item-repository.js";

/**
 * Inserts rows the tree gained, such as next occurrences, and writes the
 * structure of rows it changed since `original` was read.
 */
export const saveItemRows = Effect.fnUntraced(function* (
  items: ReturnType<typeof itemRepository>,
  tree: ItemTree,
  original: ReadonlyMap<string, TodoItem>,
) {
  for (const row of tree.allRows) {
    const previous = original.get(row.id);
    if (previous === undefined) {
      yield* items.insert(row);
    } else if (previous !== row) {
      yield* items.updateStructure(row);
    }
  }
});
