import type { KeyboardEvent, PointerEvent } from "react";
import { altArrowDirection } from "../ui/alt-arrow-direction.js";
import { cx } from "../ui/class-names.js";
import type { DropEdge } from "../ui/use-pointer-reorder.js";
import { ArchivedBadge } from "./archived-badge.js";
import { FieldChoicesPanel } from "./field-choices-panel.js";
import type { FieldDataType } from "./field-data-types.js";
import { FieldTypeIcon } from "./field-type-icon.js";
import { FieldTypeSelect } from "./field-type-select.js";
import { OrderedRowActions } from "./ordered-row-actions.js";
import { RowDragHandle } from "./row-drag-handle.js";
import type { FieldDefinition } from "./use-field-actions.js";

/** The attribute that marks a draggable field row with its ID. */
export const FIELD_ROW_ATTRIBUTE = "data-field-row-id";

/** Props for {@link FieldRow}. */
export interface FieldRowProps {
  readonly field: FieldDefinition;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  /** A reorder is saving. Move buttons stay focusable but ignore presses. */
  readonly moveBusy: boolean;
  readonly isDragging: boolean;
  readonly dropEdge: DropEdge;
  readonly choicesExpanded: boolean;
  readonly showArchived: boolean;
  readonly onDragStart: (id: string, event: PointerEvent<HTMLButtonElement>) => void;
  readonly onMove: (field: FieldDefinition, direction: -1 | 1, keepFocus: boolean) => void;
  readonly onChangeType: (field: FieldDefinition, dataType: FieldDataType) => Promise<boolean>;
  readonly onToggleChoices: (field: FieldDefinition) => void;
  readonly onRename: (field: FieldDefinition) => void;
  readonly onArchive: (field: FieldDefinition) => void;
  readonly onRestore: (field: FieldDefinition) => void;
}

/**
 * One field in the field manager with its type picker, actions and, for
 * choice fields, the choices panel. Focused active rows reorder with Alt+Arrow.
 */
export function FieldRow(props: FieldRowProps) {
  const { field, isDragging, dropEdge, onDragStart, onMove } = props;
  const active = !field.isArchived;

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const direction = altArrowDirection(event);
    if (direction !== null) {
      event.preventDefault();
      onMove(field, direction, true);
    }
  };

  return (
    <li
      aria-label={field.displayName}
      tabIndex={0}
      data-testid="field-row"
      data-archived={active ? undefined : "true"}
      {...(active ? { [FIELD_ROW_ATTRIBUTE]: field.id } : {})}
      onKeyDown={handleKeyDown}
      className={cx(
        "border-b border-line outline-none last:border-b-0 focus-visible:rounded-control focus-visible:bg-hover",
        isDragging && "opacity-45",
        dropEdge === "before" && "border-t-2 border-t-accent",
        dropEdge === "after" && "border-b-2 border-b-accent",
      )}
    >
      <div className="flex h-11 items-center gap-1.5 px-1.5">
        {active ? (
          <RowDragHandle
            label={`Drag to reorder ${field.displayName}`}
            testId="field-drag-handle"
            onPointerDown={(event) => onDragStart(field.id, event)}
          />
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <FieldTypeIcon dataType={field.dataType} />
        <span className={cx("truncate text-sm", active ? "text-fg" : "text-fg-subtle")}>
          {field.displayName}
        </span>
        {active ? null : <ArchivedBadge />}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <FieldTypeSelect
            field={field}
            onChange={(dataType) => props.onChangeType(field, dataType)}
          />
          <OrderedRowActions
            name={field.displayName}
            kind="field"
            isArchived={field.isArchived}
            canMoveUp={props.canMoveUp}
            canMoveDown={props.canMoveDown}
            moveBusy={props.moveBusy}
            onMove={(direction) => onMove(field, direction, false)}
            onRename={() => props.onRename(field)}
            onArchive={() => props.onArchive(field)}
            onRestore={() => props.onRestore(field)}
          />
        </div>
      </div>
      {field.dataType === "Choice" ? (
        <FieldChoicesPanel
          field={field}
          expanded={props.choicesExpanded}
          onToggle={() => props.onToggleChoices(field)}
          showArchived={props.showArchived}
        />
      ) : null}
    </li>
  );
}
