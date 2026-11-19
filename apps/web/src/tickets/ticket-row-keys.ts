import type { TicketPosition, TicketRow, TicketSection } from "@task-tracker/contracts";
import type { KeyboardEvent } from "react";
import { altArrowDirection } from "../ui/alt-arrow-direction.js";
import { isContextMenuKey, matchesShortcut } from "../ui/keyboard-shortcut.js";
import { openContextMenuAt } from "../ui/open-context-menu.js";
import { PUSH_BACK_SHORTCUT, pushBackReason } from "../workspace/push-back-availability.js";
import { keyboardStepPosition } from "./ticket-positions.js";
import { ticketPushBackState } from "./ticket-row-menu.js";
import { TICKET_ROW_ATTRIBUTE } from "./use-ticket-drag.js";

type Row = typeof TicketRow.Type;

/** What the row keys act on. */
export interface TicketRowKeyActions {
  readonly sections: ReadonlyArray<typeof TicketSection.Type>;
  readonly open: (row: Row) => void;
  readonly move: (row: Row, position: typeof TicketPosition.Type) => void;
  readonly pushBack: (row: Row) => void;
}

/** Moves focus to the previous or next visible ticket row. */
function focusNeighbour(row: HTMLElement, direction: -1 | 1) {
  const list = row.closest("[data-testid=tickets-scroll]");
  const rows = [...(list?.querySelectorAll<HTMLElement>(`[${TICKET_ROW_ATTRIBUTE}]`) ?? [])];
  rows[rows.indexOf(row) + direction]?.focus();
}

function plainArrow(event: KeyboardEvent<HTMLElement>): -1 | 1 | null {
  if (matchesShortcut(event, { key: "ArrowUp" })) {
    return -1;
  }
  return matchesShortcut(event, { key: "ArrowDown" }) ? 1 : null;
}

/** Ctrl+Shift+P on an eligible ticket pushes it back once, ignoring a held key's repeats. */
function handlePushBack(row: Row, event: KeyboardEvent<HTMLElement>, actions: TicketRowKeyActions) {
  if (!event.repeat && pushBackReason(ticketPushBackState(row)) === null) {
    actions.pushBack(row);
  }
}

/** Alt+↑/↓ moves one place, crossing into the next assignable section at an end (§7.16). */
function handleStep(row: Row, direction: -1 | 1, actions: TicketRowKeyActions) {
  const position = keyboardStepPosition(actions.sections, row.itemId, direction);
  if (position !== null) {
    actions.move(row, position);
  }
}

/**
 * Keys on a focused ticket row: Enter opens it, the Menu key and Shift+F10
 * open its menu, Ctrl+Shift+P pushes it back, Alt+↑/↓ moves it and ↑/↓ moves
 * focus between rows.
 */
export function handleTicketRowKey(
  row: Row,
  event: KeyboardEvent<HTMLElement>,
  actions: TicketRowKeyActions,
) {
  if (event.defaultPrevented || event.target !== event.currentTarget) {
    return;
  }
  const step = altArrowDirection(event);
  const arrow = plainArrow(event);
  if (isContextMenuKey(event)) {
    openContextMenuAt(event.currentTarget);
  } else if (matchesShortcut(event, PUSH_BACK_SHORTCUT)) {
    handlePushBack(row, event, actions);
  } else if (matchesShortcut(event, { key: "Enter" })) {
    actions.open(row);
  } else if (step !== null && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
    handleStep(row, step, actions);
  } else if (arrow !== null) {
    focusNeighbour(event.currentTarget, arrow);
  } else {
    return;
  }
  event.preventDefault();
}
