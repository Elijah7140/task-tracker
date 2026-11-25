import { useAtomSet } from "@effect/atom-react";
import { Exit } from "effect";
import { reportFailure } from "../dialogs/report-failure.js";
import { requestCompletion } from "../dialogs/request-completion.js";
import { areaKey } from "../rpc/area-queries.js";
import { CALENDAR_KEY } from "../rpc/calendar-queries.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { setItemStatusAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { markCompletedHere, rememberCompletion } from "../state/completed-here-store.js";
import { notify } from "../state/dialog-store.js";
import { noticeCompletion } from "../state/status-notice-store.js";

/** The item a row menu changes: where it lives and its current status. */
export interface ItemStatusTarget {
  readonly id: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly statusId: string | null;
}

/**
 * Runs the shared row status action with confirmation. It refreshes the item's
 * area, the project counts and Calendar, so it serves every item row menu.
 * Resolves true when the status changed. An item a Done status completes is remembered
 * for the current view, so it can stay in place (§6.2).
 */
export function useSetItemStatus() {
  const setStatus = useAtomSet(setItemStatusAtom, { mode: "promiseExit" });
  return async (item: ItemStatusTarget, statusId: string | null): Promise<boolean> => {
    if (statusId === item.statusId) {
      return false;
    }
    const reactivityKeys = [
      HISTORY_KEY,
      areaKey(item.projectId, item.folderId),
      PROJECTS_KEY,
      CALENDAR_KEY,
    ];
    const payload = { itemId: item.id, statusId };
    markCompletedHere([item.id]);
    const exit = await requestCompletion((approval) =>
      setStatus({
        payload: approval === undefined ? payload : { ...payload, confirmedOpenItemIds: approval },
        reactivityKeys,
      }),
    );
    rememberCompletion(item.id, exit !== undefined && Exit.isSuccess(exit) ? exit.value : undefined);
    if (exit === undefined) {
      return false;
    }
    if (Exit.isFailure(exit)) {
      return reportFailure("Cannot change status", exit);
    }
    if (exit.value.kind === "blocked") {
      await notify({ title: "Cannot reopen item", message: exit.value.reason });
    }
    noticeCompletion(exit.value);
    return exit.value.kind === "applied";
  };
}
