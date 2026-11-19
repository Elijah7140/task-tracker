import { useAtomValue } from "@effect/atom-react";
import type { TicketRow } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { priorityLevelsAtom } from "../rpc/lookup-queries.js";
import { statusesAtom } from "../rpc/status-queries.js";
import { markReturnPageStale } from "../state/return-page-store.js";
import { usePushBackOneDay } from "../workspace/use-push-back-one-day.js";
import { useSetItemStatus } from "../workspace/use-set-item-status.js";
import type { TicketRowActions } from "./ticket-row-menu.js";

type Row = typeof TicketRow.Type;

/** The item a shared row action changes. */
const itemOf = (row: Row) => ({
  id: row.itemId,
  projectId: row.projectId,
  folderId: row.folderId,
  statusId: row.statusId,
});

/**
 * Row menu commands for Tickets. Set status and Push back one day use the
 * shared item actions and mark the page behind out of date; Set priority and
 * Open come from the page, which keeps focus and guards drafts (§7.16).
 */
export function useTicketRowActions(
  page: Pick<TicketRowActions, "open" | "setPriority">,
): TicketRowActions {
  const statuses = useAtomValue(statusesAtom);
  const priorityLevels = useAtomValue(priorityLevelsAtom);
  const setItemStatus = useSetItemStatus();
  const pushBackItem = usePushBackOneDay();
  return {
    ...page,
    statuses: AsyncResult.isSuccess(statuses) ? statuses.value : [],
    priorityLevels: AsyncResult.isSuccess(priorityLevels) ? priorityLevels.value : [],
    setStatus: (row, statusId) =>
      void setItemStatus(itemOf(row), statusId).then((changed) => {
        if (changed) {
          markReturnPageStale();
        }
      }),
    pushBack: (row) => void pushBackItem(itemOf(row)),
  };
}
