import { useRef } from "react";
import { usePointerReorder } from "../ui/use-pointer-reorder.js";
import { useRestoreRowFocus } from "../ui/use-restore-row-focus.js";
import type { FieldDataType } from "./field-data-types.js";
import { FIELD_ROW_ATTRIBUTE, FieldRow } from "./field-row.js";
import { partitionLookups } from "./lookup-order.js";
import type { FieldDefinition, useFieldActions } from "./use-field-actions.js";

/** Props for {@link FieldList}. */
export interface FieldListProps {
  /** Every field of the manager's scope, archived ones included. */
  readonly fields: ReadonlyArray<FieldDefinition>;
  readonly showArchived: boolean;
  readonly openChoiceIds: ReadonlySet<string>;
  readonly emptyMessage: string;
  readonly actions: ReturnType<typeof useFieldActions>;
  readonly onToggleChoices: (fieldId: string) => void;
  readonly onTypeChanged: (field: FieldDefinition, dataType: FieldDataType) => void;
}

/**
 * The fields of one scope in saved order. Archived fields show in place
 * while archived items are listed; only active fields move.
 */
export function FieldList(props: FieldListProps) {
  const { fields, showArchived, actions } = props;
  const listRef = useRef<HTMLUListElement>(null);
  const { active } = partitionLookups(fields);
  const activeIds = active.map((field) => field.id);
  const shown = fields
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .filter((field) => showArchived || !field.isArchived);
  const restoreFocus = useRestoreRowFocus(listRef, FIELD_ROW_ATTRIBUTE, fields);
  const drag = usePointerReorder({
    listRef,
    rowAttribute: FIELD_ROW_ATTRIBUTE,
    activeIds,
    onDrop: (draggedId, targetId) => void actions.dragReorder(fields, draggedId, targetId),
  });

  const handleMove = (field: FieldDefinition, direction: -1 | 1, keepFocus: boolean) => {
    restoreFocus(keepFocus ? field.id : null);
    void actions.move(fields, field.id, direction);
  };

  const handleChangeType = async (field: FieldDefinition, dataType: FieldDataType) => {
    const saved = await actions.changeType(field, dataType);
    if (saved) {
      props.onTypeChanged(field, dataType);
    }
    return saved;
  };

  if (shown.length === 0) {
    return <p className="px-1.5 py-2 text-[13px] text-fg-subtle">{props.emptyMessage}</p>;
  }

  return (
    <ul ref={listRef} aria-label="Custom fields" data-testid="field-list" className="flex flex-col">
      {shown.map((field) => {
        const position = activeIds.indexOf(field.id);
        return (
          <FieldRow
            key={field.id}
            field={field}
            canMoveUp={position > 0}
            canMoveDown={position >= 0 && position < activeIds.length - 1}
            isDragging={drag.draggedId === field.id}
            dropEdge={drag.dropEdgeFor(field.id)}
            choicesExpanded={props.openChoiceIds.has(field.id)}
            showArchived={showArchived}
            onDragStart={drag.startDrag}
            onMove={handleMove}
            onChangeType={handleChangeType}
            onToggleChoices={(target) => props.onToggleChoices(target.id)}
            onRename={(target) => void actions.rename(target)}
            onArchive={(target) => void actions.archive(target)}
            onRestore={(target) => void actions.restore(target)}
          />
        );
      })}
    </ul>
  );
}
