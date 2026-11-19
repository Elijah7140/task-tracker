import type { PriorityLevelProjection, StatusProjection, TicketRow } from "@task-tracker/contracts";
import { Flag, SquareArrowOutUpRight } from "lucide-react";
import { ContextMenuContent, MenuItem } from "../ui/menu.js";
import { ItemStatusMenu } from "../workspace/item-status-menu.js";
import { PushBackMenuItem } from "../workspace/push-back-menu-item.js";
import { RowLookupMenu } from "../workspace/row-lookup-menu.js";

type Row = typeof TicketRow.Type;

/** The lookups and commands behind every ticket row menu. */
export interface TicketRowActions {
  readonly statuses: ReadonlyArray<typeof StatusProjection.Type>;
  readonly priorityLevels: ReadonlyArray<typeof PriorityLevelProjection.Type>;
  readonly open: (row: Row) => void;
  readonly setStatus: (row: Row, statusId: string | null) => void;
  /** Moves the ticket to the bottom of the chosen section (§7.16). */
  readonly setPriority: (row: Row, priorityLevelId: string | null) => void;
  readonly pushBack: (row: Row) => void;
}

/** Whether Push back one day applies to an open ticket: it needs a due date or a block. */
export const ticketPushBackState = (row: Row) => ({
  isCompleted: false,
  hasDates: row.dueDate !== null || row.hasSchedule,
});

/** A ticket's row menu: Open, Set status, Set priority and Push back one day (§7.16). */
export function TicketRowMenu({
  row,
  actions,
}: {
  readonly row: Row;
  readonly actions: TicketRowActions;
}) {
  return (
    <ContextMenuContent testId="ticket-row-menu">
      <MenuItem
        icon={<SquareArrowOutUpRight size={14} />}
        onClick={() => actions.open(row)}
        testId="ticket-menu-open"
      >
        Open
      </MenuItem>
      <ItemStatusMenu
        statuses={actions.statuses}
        statusId={row.statusId}
        onChange={(statusId) => actions.setStatus(row, statusId)}
      />
      <RowLookupMenu
        label="Set priority"
        icon={<Flag size={14} />}
        entries={actions.priorityLevels}
        currentId={row.priorityLevelId}
        onSelect={(priorityLevelId) => actions.setPriority(row, priorityLevelId)}
        testId="item-menu-set-priority"
      />
      <PushBackMenuItem state={ticketPushBackState(row)} onPushBack={() => actions.pushBack(row)} />
    </ContextMenuContent>
  );
}
