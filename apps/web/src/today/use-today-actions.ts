import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { TodayRow } from "@task-tracker/contracts";
import { Exit } from "effect";
import { AsyncResult } from "effect/reactivity";
import { reportFailure } from "../dialogs/report-failure.js";
import { areaKey } from "../rpc/area-queries.js";
import { CALENDAR_KEY } from "../rpc/calendar-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { setItemCompletedAtom } from "../rpc/item-mutations.js";
import { priorityLevelsAtom } from "../rpc/lookup-queries.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { statusesAtom } from "../rpc/status-queries.js";
import { useOpenSearchResult } from "../search/use-open-search-result.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { notify } from "../state/dialog-store.js";
import { markReturnPageStale, runReturnPageWrite } from "../state/return-page-store.js";
import { noticeCompletion } from "../state/status-notice-store.js";
import { usePushBackOneDay } from "../workspace/use-push-back-one-day.js";
import { useSetItemPriority } from "../workspace/use-set-item-priority.js";
import { useSetItemStatus } from "../workspace/use-set-item-status.js";

type Row = typeof TodayRow.Type;

const itemOf = (row: Row) => ({
  id: row.itemId,
  projectId: row.projectId,
  folderId: row.folderId,
  statusId: row.statusId,
  priorityLevelId: row.priorityLevelId,
});

const markStaleIf = (changed: boolean) => {
  if (changed) {
    markReturnPageStale();
  }
};

/**
 * Reopens a row's item as one undo step (§7.14). The write runs as a
 * covering-page write, so it marks the page behind out of date and Back waits
 * for it. A blocked reopen explains why.
 */
function useReopen() {
  const setCompleted = useAtomSet(setItemCompletedAtom, { mode: "promiseExit" });
  const save = async (row: Row) => {
    const exit = await setCompleted({
      payload: {
        projectId: row.projectId,
        folderId: row.folderId,
        itemId: row.itemId,
        completed: false,
      },
      reactivityKeys: [
        HISTORY_KEY,
        areaKey(row.projectId, row.folderId),
        PROJECTS_KEY,
        CALENDAR_KEY,
      ],
    });
    if (!(await reportFailure("Cannot reopen item", exit)) || !Exit.isSuccess(exit)) {
      return false;
    }
    if (exit.value.kind === "blocked") {
      await notify({ title: "Cannot reopen item", message: exit.value.reason });
    }
    noticeCompletion(exit.value);
    return exit.value.kind === "applied";
  };
  return (row: Row) => void runReturnPageWrite(() => save(row));
}

/**
 * The Today row commands (§7.14): open the item in its workspace after the
 * unsaved-changes guard, reopen it, and the shared Set status, Set priority
 * and Push back one day row actions. Each change marks the page behind out of
 * date, and Today refreshes after every save through its query.
 */
export function useTodayActions(runGuards: ReturnGuard) {
  const statuses = useAtomValue(statusesAtom);
  const priorityLevels = useAtomValue(priorityLevelsAtom);
  const opener = useOpenSearchResult(runGuards);
  const setItemStatus = useSetItemStatus();
  const setItemPriority = useSetItemPriority();
  const pushBackItem = usePushBackOneDay();
  const reopen = useReopen();
  return {
    statuses: AsyncResult.isSuccess(statuses) ? statuses.value : [],
    priorityLevels: AsyncResult.isSuccess(priorityLevels) ? priorityLevels.value : [],
    openError: opener.error,
    open: (row: Row) => void opener.open(row.itemId),
    reopen,
    setStatus: (row: Row, statusId: string | null) =>
      void setItemStatus(itemOf(row), statusId).then(markStaleIf),
    setPriority: (row: Row, priorityLevelId: string | null) =>
      void setItemPriority(itemOf(row), priorityLevelId).then(markStaleIf),
    pushBack: (row: Row) =>
      void pushBackItem({ id: row.itemId, projectId: row.projectId, folderId: row.folderId }),
  };
}

/** The commands behind each Today row. */
export type TodayActions = ReturnType<typeof useTodayActions>;
