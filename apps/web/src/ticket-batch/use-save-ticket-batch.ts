import { useAtomSet } from "@effect/atom-react";
import type { AddTicketsError } from "@task-tracker/contracts";
import { Cause, Exit, Option } from "effect";
import type { RpcClientError } from "effect/rpc";
import { announceDataChanged } from "../native/data-change-broadcast.js";
import { areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { addTicketsAtom } from "../rpc/item-mutations.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import { TICKETS_KEY } from "../rpc/ticket-queries.js";
import { TODAY_KEY } from "../rpc/today-queries.js";
import type { BatchDestination } from "./batch-destination.js";
import type { BatchEntry } from "./ticket-batch-entries.js";

/** Done's outcome: saved, or the message to show and the refused ticket's index, if any. */
export type SaveBatchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly index: number | null };

type Failure = typeof AddTicketsError.Type | RpcClientError.RpcClientError;

/** Reads a refused ticket's index and message, or describes any other failure. */
function describeBatchFailure(cause: Cause.Cause<Failure>): SaveBatchResult {
  const error = Cause.findErrorOption(cause);
  if (Option.isSome(error) && error.value._tag === "TicketRejected") {
    return { ok: false, message: error.value.message, index: error.value.index };
  }
  const other = cause as Cause.Cause<Exclude<Failure, { readonly _tag: "TicketRejected" }>>;
  return { ok: false, message: describeRpcFailure(other), index: null };
}

/**
 * Sends the listed tickets as one AddTickets call (§7.20). On success the app's other
 * windows hear about the change and reload, as after the tray card's Mark complete.
 */
export function useSaveTicketBatch() {
  const add = useAtomSet(addTicketsAtom, { mode: "promiseExit" });

  return async (
    destination: BatchDestination,
    entries: ReadonlyArray<BatchEntry>,
  ): Promise<SaveBatchResult> => {
    const { projectId, folderId } = destination;
    const exit = await add({
      payload: { projectId, folderId, tickets: entries.map((entry) => entry.ticket) },
      reactivityKeys: [
        HISTORY_KEY,
        areaKey(projectId, folderId),
        PROJECTS_KEY,
        TICKETS_KEY,
        TODAY_KEY,
      ],
    });
    if (Exit.isFailure(exit)) {
      return describeBatchFailure(exit.cause);
    }
    announceDataChanged();
    return { ok: true };
  };
}
