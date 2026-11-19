import { useAtomSet } from "@effect/atom-react";
import { areaKey } from "../rpc/area-queries.js";
import { CALENDAR_KEY } from "../rpc/calendar-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { setItemPriorityAtom } from "../rpc/item-mutations.js";
import { reportItemFailure } from "./use-item-structure-actions.js";

/** The item a row menu changes: where it lives and its current priority. */
export interface ItemPriorityTarget {
  readonly id: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly priorityLevelId: string | null;
}

/**
 * Sets only an item's priority from a row menu (§7.15). It refreshes the item's
 * area and Calendar, so it serves every item row menu, and reports a failure.
 * Resolves true when the priority changed.
 */
export function useSetItemPriority() {
  const setPriority = useAtomSet(setItemPriorityAtom, { mode: "promiseExit" });
  return async (item: ItemPriorityTarget, priorityLevelId: string | null): Promise<boolean> => {
    if (priorityLevelId === item.priorityLevelId) {
      return false;
    }
    const exit = await setPriority({
      payload: { itemId: item.id, priorityLevelId },
      reactivityKeys: [HISTORY_KEY, areaKey(item.projectId, item.folderId), CALENDAR_KEY],
    });
    return reportItemFailure(exit);
  };
}
