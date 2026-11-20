import { ContextMenu } from "@base-ui/react/context-menu";
import type { TicketRow as TicketRowRecord } from "@task-tracker/contracts";
import type { HTMLAttributes, KeyboardEvent, PointerEvent } from "react";
import { formatFloatingDate, formatFloatingDateTime } from "../format/item-dates.js";
import { cx } from "../ui/class-names.js";
import { TICKET_COLUMNS } from "./ticket-columns.js";
import { TicketRowMenu, type TicketRowActions } from "./ticket-row-menu.js";
import { TICKET_ROW_ATTRIBUTE } from "./use-ticket-drag.js";

type Row = typeof TicketRowRecord.Type;

/** How a ticket row looks during a drag. */
export interface TicketRowDragView {
  readonly dragging: boolean;
  readonly drop: "before" | "after" | null;
}

/** Props for {@link TicketRow}. */
export interface TicketRowProps {
  readonly row: Row;
  readonly tabIndex: 0 | -1;
  readonly view: TicketRowDragView;
  readonly actions: TicketRowActions;
  readonly onKeyDown: (row: Row, event: KeyboardEvent<HTMLElement>) => void;
  readonly onPointerDown: (row: Row, event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (row: Row) => void;
}

function dueText({ dueDate, dueTime }: Row): string {
  if (dueDate === null) {
    return "";
  }
  return dueTime === null ? formatFloatingDate(dueDate) : formatFloatingDateTime(dueDate, dueTime);
}

function StatusChip({ name }: { readonly name: string | null }) {
  if (name === null) {
    return <span />;
  }
  return (
    <span
      data-testid="ticket-status"
      title={name}
      className="justify-self-start truncate rounded-full border border-line bg-hover px-2 py-0.5 text-[11px] font-medium text-fg-muted"
    >
      {name}
    </span>
  );
}

const DROP_EDGE = {
  before: "before:top-0",
  after: "before:bottom-0",
} as const;

function TicketRowItem({
  triggerProps,
  ...props
}: TicketRowProps & { readonly triggerProps: HTMLAttributes<HTMLElement> }) {
  const { row, tabIndex, view } = props;
  const cell = "truncate text-xs text-fg-muted";
  return (
    <li
      {...triggerProps}
      {...{ [TICKET_ROW_ATTRIBUTE]: row.itemId }}
      tabIndex={tabIndex}
      aria-label={row.title}
      aria-keyshortcuts="Enter Alt+ArrowUp Alt+ArrowDown Control+Shift+P"
      data-testid="ticket-row"
      data-drop={view.drop ?? undefined}
      data-dragging={view.dragging || undefined}
      onFocus={() => props.onFocus(row)}
      onKeyDown={(event) => {
        triggerProps.onKeyDown?.(event);
        props.onKeyDown(row, event);
      }}
      onPointerDown={(event) => {
        triggerProps.onPointerDown?.(event);
        props.onPointerDown(row, event);
      }}
      className={cx(
        TICKET_COLUMNS,
        "relative cursor-default px-3 py-2 text-sm outline-none select-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset data-dragging:opacity-45",
        view.drop === null
          ? null
          : `before:pointer-events-none before:absolute before:right-2 before:left-2 before:h-0.5 before:rounded-full before:bg-accent ${DROP_EDGE[view.drop]}`,
      )}
    >
      <span className={`${cell} font-mono`}>{row.ticketNumber}</span>
      <span className="truncate font-medium" title={row.title}>
        {row.title}
      </span>
      <span className={cell} title={row.projectName}>
        {row.projectName}
      </span>
      <StatusChip name={row.statusName} />
      <span className={cell}>{dueText(row)}</span>
    </li>
  );
}

/**
 * One ticket. It takes focus on press, Enter or its menu opens it, Alt+↑/↓
 * moves it, and right-click, the Menu key or Shift+F10 opens its menu (§7.16).
 */
export function TicketRow(props: TicketRowProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={(triggerProps: HTMLAttributes<HTMLElement>) => (
          <TicketRowItem {...props} triggerProps={triggerProps} />
        )}
      />
      <TicketRowMenu row={props.row} actions={props.actions} />
    </ContextMenu.Root>
  );
}
