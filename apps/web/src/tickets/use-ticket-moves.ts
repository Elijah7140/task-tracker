import { useAtomSet } from "@effect/atom-react";
import type { TicketPosition, TicketRow } from "@task-tracker/contracts";
import { Exit } from "effect";
import { useCallback, useRef, useState } from "react";
import { areaKey } from "../rpc/area-queries.js";
import { CALENDAR_KEY } from "../rpc/calendar-queries.js";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import { moveTicketAtom, setTicketPriorityAtom, TICKETS_KEY } from "../rpc/ticket-queries.js";
import { runReturnPageWrite } from "../state/return-page-store.js";

type Row = typeof TicketRow.Type;
type Position = typeof TicketPosition.Type;
type Send = (reactivityKeys: ReadonlyArray<string>) => Promise<Exit.Exit<boolean, RpcFailure>>;

/** Options for {@link useTicketMoves}. */
export interface TicketMovesOptions {
  /** Reloads the board after a refused or failed write. */
  readonly reload: () => void;
  /** Puts focus back on the moved ticket once the board shows its new place. */
  readonly followTicket: (itemId: string) => void;
}

/**
 * Saves ticket moves and Set priority from Tickets (§7.16). One write runs at
 * a time and a newer one is ignored. The page behind is marked out of date by
 * a change and Back waits for the write. A refusal shows inline and reloads the
 * board; a change keeps focus on the moved ticket.
 */
export function useTicketMoves({ reload, followTicket }: TicketMovesOptions) {
  const move = useAtomSet(moveTicketAtom, { mode: "promiseExit" });
  const setPriority = useAtomSet(setTicketPriorityAtom, { mode: "promiseExit" });
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ reload, followTicket });
  latest.current = { reload, followTicket };

  const save = async (row: Row, send: Send) => {
    const keys = [HISTORY_KEY, TICKETS_KEY, CALENDAR_KEY, areaKey(row.projectId, row.folderId)];
    const exit = await send(keys);
    if (Exit.isFailure(exit)) {
      setError(describeRpcFailure(exit.cause));
      latest.current.reload();
      return false;
    }
    return exit.value;
  };

  const run = async (row: Row, send: Send) => {
    if (running.current) {
      return;
    }
    running.current = true;
    setError(null);
    try {
      if (await runReturnPageWrite(() => save(row, send))) {
        latest.current.followTicket(row.itemId);
      }
    } finally {
      running.current = false;
    }
  };

  return {
    error,
    clearError: useCallback(() => setError(null), []),
    /** Whether a move or priority change is saving. */
    isRunning: () => running.current,
    move: (row: Row, position: Position) =>
      run(row, (reactivityKeys) =>
        move({ payload: { itemId: row.itemId, position }, reactivityKeys }),
      ),
    setPriority: (row: Row, priorityLevelId: string | null) =>
      run(row, (reactivityKeys) =>
        setPriority({ payload: { itemId: row.itemId, priorityLevelId }, reactivityKeys }),
      ),
  };
}
