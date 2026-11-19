import { useRef } from "react";
import { useListReorder } from "../ui/use-list-reorder.js";
import { CHOICE_ROW_ATTRIBUTE, FieldChoiceRow } from "./field-choice-row.js";
import { partitionLookups } from "./lookup-order.js";
import type { FieldChoice, useFieldChoiceActions } from "./use-field-choice-actions.js";

/** Props for {@link FieldChoiceList}. */
export interface FieldChoiceListProps {
  readonly fieldName: string;
  /** Every choice of the field, archived ones included. */
  readonly choices: ReadonlyArray<FieldChoice>;
  readonly showArchived: boolean;
  readonly actions: ReturnType<typeof useFieldChoiceActions>;
}

/**
 * The choices of one field in saved order. Archived choices show in place
 * while archived items are listed; only active choices move.
 */
export function FieldChoiceList({
  fieldName,
  choices,
  showArchived,
  actions,
}: FieldChoiceListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const { active } = partitionLookups(choices);
  const activeIds = active.map((choice) => choice.id);
  const shown = choices
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .filter((choice) => showArchived || !choice.isArchived);
  const reorder = useListReorder({
    listRef,
    rowAttribute: CHOICE_ROW_ATTRIBUTE,
    rows: choices,
    activeIds,
    move: actions.move,
    dragReorder: actions.dragReorder,
  });
  const drag = reorder.drag;
  const handleMove = (choice: FieldChoice, direction: -1 | 1, keepFocus: boolean) =>
    reorder.move(choice.id, direction, keepFocus);

  if (shown.length === 0) {
    return <p className="px-1 py-1.5 text-[13px] text-fg-subtle">No choices yet.</p>;
  }

  return (
    <ul
      ref={listRef}
      aria-label={`Choices of ${fieldName}`}
      data-testid="field-choice-list"
      className="flex flex-col"
    >
      {shown.map((choice) => {
        const position = activeIds.indexOf(choice.id);
        return (
          <FieldChoiceRow
            key={choice.id}
            choice={choice}
            canMoveUp={position > 0}
            canMoveDown={position >= 0 && position < activeIds.length - 1}
            moveBusy={reorder.busy}
            isDragging={drag.draggedId === choice.id}
            dropEdge={drag.dropEdgeFor(choice.id)}
            onDragStart={drag.startDrag}
            onMove={handleMove}
            onRename={(target) => void actions.rename(target)}
            onArchive={(target) => void actions.archive(target)}
            onRestore={(target) => void actions.restore(target)}
          />
        );
      })}
    </ul>
  );
}
