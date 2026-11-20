import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { TicketBoard, TicketRow } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { CircleAlert } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { ticketBoardAtom } from "../rpc/ticket-queries.js";
import { useOpenSearchResult } from "../search/use-open-search-result.js";
import type { ReturnGuard } from "../shell/return-guards.js";
import { LoadFailure } from "../ui/load-failure.js";
import { useRovingFocus } from "../ui/use-roving-focus.js";
import { TICKET_COLUMNS } from "./ticket-columns.js";
import { handleTicketRowKey } from "./ticket-row-keys.js";
import type { TicketRowActions } from "./ticket-row-menu.js";
import { TicketSectionList } from "./ticket-section.js";
import { ALL_PROJECTS, TicketsHeader } from "./tickets-header.js";
import { useFollowTicket } from "./use-follow-ticket.js";
import { useTicketDrag, type TicketDragState } from "./use-ticket-drag.js";
import { useTicketMoves } from "./use-ticket-moves.js";
import { useTicketRowActions } from "./use-ticket-row-actions.js";

type Board = typeof TicketBoard.Type;
type Row = typeof TicketRow.Type;

/** Props for {@link TicketsPage}. */
export interface TicketsPageProps {
  readonly onBack: () => void;
  readonly runGuards: ReturnGuard;
}

function TicketsError({ message }: { readonly message: string }) {
  return (
    <p
      role="alert"
      data-testid="tickets-error"
      className="mb-3 flex items-start gap-2 rounded-card border border-line bg-danger-soft px-4 py-2.5 text-[13px] text-danger"
    >
      <CircleAlert size={15} aria-hidden="true" className="mt-px shrink-0" />
      {message}
    </p>
  );
}

function ColumnHeader() {
  return (
    <div
      aria-hidden="true"
      data-testid="tickets-columns"
      className={`${TICKET_COLUMNS} overflow-hidden px-3 pb-2 text-xs font-medium text-fg-subtle [scrollbar-gutter:stable]`}
    >
      <span>Ticket</span>
      <span>Title</span>
      <span>Project</span>
      <span>Status</span>
      <span>Due</span>
    </div>
  );
}

/** The board for the chosen project. A project that disappears falls back to All projects. */
function useTicketBoard() {
  const [filter, setFilter] = useState(ALL_PROJECTS);
  const atom = ticketBoardAtom(filter === ALL_PROJECTS ? null : filter);
  const result = useAtomValue(atom);
  const reload = useAtomRefresh(atom);
  const board = AsyncResult.isSuccess(result) ? result.value : null;
  const known = board === null || board.projects.some(({ id }) => id === filter);
  if (filter !== ALL_PROJECTS && !known) {
    setFilter(ALL_PROJECTS);
  }
  return { filter, setFilter, result, reload, board };
}

/** Keeps one row in the tab order, starting at the first ticket. */
function useTicketTabStop(board: Board | null) {
  const rows = useMemo(() => board?.sections.flatMap(({ tickets }) => tickets) ?? [], [board]);
  const ids = useMemo(() => new Set(rows.map(({ itemId }) => itemId)), [rows]);
  const roving = useRovingFocus(rows[0]?.itemId ?? null, ids);
  return {
    tabIndexFor: (row: Row) => roving.tabIndexFor(row.itemId) as 0 | -1,
    onFocus: (row: Row) => roving.onItemFocus(row.itemId),
  };
}

interface TicketListProps {
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly board: Board;
  readonly drag: TicketDragState | null;
  readonly actions: TicketRowActions;
  readonly onKeyDown: Parameters<typeof TicketSectionList>[0]["onKeyDown"];
  readonly onPointerDown: Parameters<typeof TicketSectionList>[0]["onPointerDown"];
}

function TicketList({ listRef, board, drag, ...rowProps }: TicketListProps) {
  const tabStop = useTicketTabStop(board);
  const empty = board.sections.every(({ tickets }) => tickets.length === 0);
  return (
    <div
      ref={listRef}
      data-testid="tickets-scroll"
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
    >
      {empty ? (
        <p data-testid="tickets-empty" className="px-3 pb-3 text-fg-muted">
          No open tickets for this filter.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 pb-2">
        {board.sections.map((section) => (
          <TicketSectionList
            key={section.priorityLevelId ?? ""}
            section={section}
            drag={drag}
            {...tabStop}
            {...rowProps}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Tickets (§7.16): open items with a ticket number in every project or one,
 * in No priority and then one section per level, each in its hand-set order.
 * Dragging a row or Alt+↑/↓ moves a ticket, and crossing into another section
 * changes its priority. It is a covering page: Back returns to the page behind,
 * which a change marks out of date.
 */
export function TicketsPage({ onBack, runGuards }: TicketsPageProps) {
  const { filter, setFilter, result, reload, board } = useTicketBoard();
  const listRef = useRef<HTMLDivElement>(null);
  const followTicket = useFollowTicket(listRef, board);
  const moves = useTicketMoves({ reload, followTicket });
  const opener = useOpenSearchResult(runGuards);
  // A ticket deleted since the board loaded is reported and dropped from the board.
  useEffect(() => {
    if (opener.error !== null) {
      reload();
    }
  }, [opener.error, reload]);
  const sections = board?.sections ?? [];
  const open = (row: Row) => {
    if (!moves.isRunning()) {
      moves.clearError();
      void opener.open(row.itemId);
    }
  };
  const actions = useTicketRowActions({ open, setPriority: moves.setPriority });
  const { drag, startDrag } = useTicketDrag({ listRef, sections, onDrop: moves.move });
  const keyActions = { sections, open, move: moves.move, pushBack: actions.pushBack };
  const error = moves.error ?? opener.error;

  return (
    <div
      data-testid="tickets-page"
      data-dragging={drag === null ? undefined : true}
      className="mx-auto flex h-full w-full max-w-[68rem] flex-col px-10 pt-12 pb-6 data-dragging:cursor-grabbing"
    >
      <TicketsHeader
        projects={board?.projects ?? []}
        projectFilter={filter}
        onProjectFilterChange={(value) => {
          moves.clearError();
          opener.clearError();
          setFilter(value);
        }}
        onBack={onBack}
      />
      {error === null ? null : <TicketsError message={error} />}
      <ColumnHeader />
      {AsyncResult.isFailure(result) ? (
        <LoadFailure message={describeRpcFailure(result.cause)} onRetry={reload} />
      ) : board === null ? (
        <p className="px-3 text-fg-muted" data-testid="tickets-loading">
          Loading tickets…
        </p>
      ) : (
        <TicketList
          listRef={listRef}
          board={board}
          drag={drag}
          actions={actions}
          onKeyDown={(row, event) => handleTicketRowKey(row, event, keyActions)}
          onPointerDown={(row, event) => startDrag(row, event)}
        />
      )}
    </div>
  );
}
