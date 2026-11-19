import { useAtomValue } from "@effect/atom-react";
import type { CalendarEntry } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { priorityLevelsAtom } from "../rpc/lookup-queries.js";
import { statusesAtom } from "../rpc/status-queries.js";
import { markReturnPageStale } from "../state/return-page-store.js";
import { useSetItemPriority } from "../workspace/use-set-item-priority.js";
import { useSetItemStatus } from "../workspace/use-set-item-status.js";
import type { CalendarEntryMenuActions } from "./calendar-entry-menu.js";

type Entry = typeof CalendarEntry.Type;

const itemOf = (entry: Entry) => ({
  id: entry.itemId,
  projectId: entry.projectId,
  folderId: entry.folderId,
  statusId: entry.statusId,
  priorityLevelId: entry.priorityLevelId,
});

/**
 * Set status and Set priority for calendar entries, through the same row
 * actions as the workspace (§7.15). Both reload Calendar, and a change marks
 * the page behind it out of date (§7.8).
 */
export function useCalendarEntryActions(): CalendarEntryMenuActions {
  const statuses = useAtomValue(statusesAtom);
  const priorityLevels = useAtomValue(priorityLevelsAtom);
  const setItemStatus = useSetItemStatus();
  const setItemPriority = useSetItemPriority();
  const markStaleIf = (changed: boolean) => {
    if (changed) {
      markReturnPageStale();
    }
  };
  return {
    statuses: AsyncResult.isSuccess(statuses) ? statuses.value : [],
    priorityLevels: AsyncResult.isSuccess(priorityLevels) ? priorityLevels.value : [],
    setStatus: (entry, statusId) => void setItemStatus(itemOf(entry), statusId).then(markStaleIf),
    setPriority: (entry, priorityLevelId) =>
      void setItemPriority(itemOf(entry), priorityLevelId).then(markStaleIf),
  };
}
