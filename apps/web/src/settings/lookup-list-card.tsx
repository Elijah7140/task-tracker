import { Input } from "@base-ui/react/input";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "../ui/button.js";
import { SectionCard } from "../ui/section-card.js";
import { usePointerReorder } from "../ui/use-pointer-reorder.js";
import { useRestoreRowFocus } from "../ui/use-restore-row-focus.js";
import { partitionLookups } from "./lookup-order.js";
import { LookupRow } from "./lookup-row.js";
import { type LookupItem, type LookupKind, useLookupActions } from "./use-lookup-actions.js";

const ROW_ATTRIBUTE = "data-lookup-row-id";

/** Props for {@link LookupListCard}. */
export interface LookupListCardProps {
  readonly kind: LookupKind;
  readonly rows: ReadonlyArray<LookupItem>;
}

function ArchivedRows({
  archived,
  listLabel,
  onRestore,
}: {
  readonly archived: ReadonlyArray<LookupItem>;
  readonly listLabel: string;
  readonly onRestore: (row: LookupItem) => void;
}) {
  if (archived.length === 0) {
    return null;
  }
  return (
    <div data-testid="lookup-archived-section" className="flex flex-col gap-1.5 pt-1">
      <h3 className="text-xs font-medium text-fg-subtle">Archived</h3>
      <ul aria-label={`Archived ${listLabel}`} className="flex flex-col gap-1">
        {archived.map((row) => (
          <li
            key={row.id}
            aria-label={row.name}
            data-testid="lookup-archived-row"
            className="flex h-8 items-center justify-between gap-2 px-1.5 text-sm text-fg-subtle"
          >
            <span className="truncate">{row.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Restore ${row.name}`}
              onClick={() => onRestore(row)}
              data-testid="lookup-restore"
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Editable card for either item types or priority levels. Supports adding,
 * renaming, button/Alt+Arrow/pointer-drag reordering, archiving and restoring.
 */
export function LookupListCard({ kind, rows }: LookupListCardProps) {
  const isItemType = kind === "itemTypes";
  const title = isItemType ? "Item types" : "Priority levels";
  const listLabel = isItemType ? "item types" : "priority levels";
  const singular = isItemType ? "item type" : "priority level";
  const testId = isItemType ? "lookup-list-item-types" : "lookup-list-priority-levels";

  const [newName, setNewName] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const actions = useLookupActions(kind);
  const { active, archived } = partitionLookups(rows);
  const restoreFocus = useRestoreRowFocus(listRef, ROW_ATTRIBUTE, rows);
  const drag = usePointerReorder({
    listRef,
    rowAttribute: ROW_ATTRIBUTE,
    activeIds: active.map((row) => row.id),
    onDrop: (draggedId, targetId) => void actions.dragReorder(rows, draggedId, targetId),
  });

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await actions.add(newName)) {
      setNewName("");
    }
  };

  const handleMove = (id: string, direction: -1 | 1, keepFocus: boolean) => {
    restoreFocus(keepFocus ? id : null);
    void actions.move(rows, id, direction);
  };

  return (
    <SectionCard
      title={title}
      description={
        isItemType
          ? "Changes save immediately."
          : "Top of the list is the most important. Changes save immediately."
      }
      testId={testId}
    >
      <ul
        ref={listRef}
        aria-label={`Active ${listLabel}`}
        data-testid="lookup-active-list"
        className="flex flex-col"
      >
        {active.map((row, index) => (
          <LookupRow
            key={row.id}
            row={row}
            kind={kind}
            isFirst={index === 0}
            isLast={index === active.length - 1}
            isDragging={drag.draggedId === row.id}
            dropEdge={drag.dropEdgeFor(row.id)}
            onDragStart={drag.startDrag}
            onMove={handleMove}
            onRename={(target) => void actions.rename(target)}
            onArchive={(target) => void actions.archive(target)}
          />
        ))}
      </ul>

      <ArchivedRows
        archived={archived}
        listLabel={listLabel}
        onRestore={(target) => void actions.restore(target)}
      />

      <form className="flex items-center gap-2 pt-1" onSubmit={(event) => void handleAdd(event)}>
        <Input
          value={newName}
          onValueChange={setNewName}
          placeholder="New name"
          aria-label={`New ${singular} name`}
          autoComplete="off"
          spellCheck={false}
          data-testid="lookup-new-name"
          className="h-9 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus"
        />
        <Button type="submit" data-testid="lookup-add">
          Add
        </Button>
      </form>
    </SectionCard>
  );
}
