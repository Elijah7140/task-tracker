import type { KeyboardEvent, PointerEvent } from "react";
import { altArrowDirection } from "../ui/alt-arrow-direction.js";
import { cx } from "../ui/class-names.js";
import type { DropEdge } from "../ui/use-pointer-reorder.js";
import { ArchivedBadge } from "./archived-badge.js";
import { OrderedRowActions } from "./ordered-row-actions.js";
import { RowDragHandle } from "./row-drag-handle.js";
import type { FieldChoice } from "./use-field-choice-actions.js";

/** The attribute that marks a draggable choice row with its ID. */
export const CHOICE_ROW_ATTRIBUTE = "data-choice-row-id";

/** Props for {@link FieldChoiceRow}. */
export interface FieldChoiceRowProps {
  readonly choice: FieldChoice;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  /** A reorder is saving. Move buttons stay focusable but ignore presses. */
  readonly moveBusy: boolean;
  readonly isDragging: boolean;
  readonly dropEdge: DropEdge;
  readonly onDragStart: (id: string, event: PointerEvent<HTMLButtonElement>) => void;
  readonly onMove: (choice: FieldChoice, direction: -1 | 1, keepFocus: boolean) => void;
  readonly onRename: (choice: FieldChoice) => void;
  readonly onArchive: (choice: FieldChoice) => void;
  readonly onRestore: (choice: FieldChoice) => void;
}

/** One choice in a choices panel. Focused active rows reorder with Alt+Arrow keys. */
export function FieldChoiceRow({
  choice,
  canMoveUp,
  canMoveDown,
  moveBusy,
  isDragging,
  dropEdge,
  onDragStart,
  onMove,
  onRename,
  onArchive,
  onRestore,
}: FieldChoiceRowProps) {
  const active = !choice.isArchived;

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const direction = altArrowDirection(event);
    if (direction !== null) {
      event.preventDefault();
      onMove(choice, direction, true);
    }
  };

  return (
    <li
      aria-label={choice.label}
      tabIndex={0}
      data-testid="field-choice-row"
      data-archived={active ? undefined : "true"}
      {...(active ? { [CHOICE_ROW_ATTRIBUTE]: choice.id } : {})}
      onKeyDown={handleKeyDown}
      className={cx(
        "flex h-9 items-center gap-1.5 border-b border-line px-1 outline-none last:border-b-0 focus-visible:rounded-control focus-visible:bg-hover",
        isDragging && "opacity-45",
        dropEdge === "before" && "border-t-2 border-t-accent",
        dropEdge === "after" && "border-b-2 border-b-accent",
      )}
    >
      {active ? (
        <RowDragHandle
          label={`Drag to reorder choice ${choice.label}`}
          testId="choice-drag-handle"
          onPointerDown={(event) => onDragStart(choice.id, event)}
        />
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0" />
      )}
      <span className={cx("truncate text-sm", active ? "text-fg" : "text-fg-subtle")}>
        {choice.label}
      </span>
      {active ? null : <ArchivedBadge />}
      <div className="ml-auto">
        <OrderedRowActions
          name={choice.label}
          kind="choice"
          isArchived={choice.isArchived}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          moveBusy={moveBusy}
          onMove={(direction) => onMove(choice, direction, false)}
          onRename={() => onRename(choice)}
          onArchive={() => onArchive(choice)}
          onRestore={() => onRestore(choice)}
        />
      </div>
    </li>
  );
}
