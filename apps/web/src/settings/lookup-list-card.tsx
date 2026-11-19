import { Input } from "@base-ui/react/input";
import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button.js";
import { SectionCard } from "../ui/section-card.js";
import { partitionLookups } from "./lookup-order.js";
import { type DropEdge, LookupRow } from "./lookup-row.js";
import { type LookupItem, type LookupKind, useLookupActions } from "./use-lookup-actions.js";
import { type LookupDragState, useLookupDrag } from "./use-lookup-drag.js";
import { useLookupReorder } from "./use-lookup-reorder.js";

/** Props for {@link LookupListCard}. */
export interface LookupListCardProps {
  readonly kind: LookupKind;
  readonly rows: ReadonlyArray<LookupItem>;
}

/** Visible text and test IDs for one lookup list. */
function lookupLabels(kind: LookupKind) {
  if (kind === "itemTypes") {
    return {
      title: "Item types",
      description: "Changes save immediately.",
      listLabel: "item types",
      singular: "item type",
      testId: "lookup-list-item-types",
    };
  }
  return {
    title: "Priority levels",
    description: "Top of the list is the most important. Changes save immediately.",
    listLabel: "priority levels",
    singular: "priority level",
    testId: "lookup-list-priority-levels",
  };
}

function dropEdgeFor(
  rowId: string,
  active: ReadonlyArray<LookupItem>,
  dragState: LookupDragState | null,
): DropEdge {
  if (dragState === null || dragState.overId !== rowId || dragState.draggedId === rowId) {
    return null;
  }
  const fromIndex = active.findIndex((row) => row.id === dragState.draggedId);
  const toIndex = active.findIndex((row) => row.id === rowId);
  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }
  return toIndex < fromIndex ? "before" : "after";
}

/** Focuses a requested row once the list re-renders with the saved order. */
function useRowFocusAfterRefresh(
  listRef: RefObject<HTMLUListElement | null>,
  rows: ReadonlyArray<LookupItem>,
) {
  const pendingFocusIdRef = useRef<string | null>(null);

  useEffect(() => {
    const focusId = pendingFocusIdRef.current;
    if (focusId === null) {
      return;
    }
    pendingFocusIdRef.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-lookup-row-id="${focusId}"]`)?.focus();
  }, [listRef, rows]);

  return (id: string | null) => {
    pendingFocusIdRef.current = id;
  };
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

/** The new-name input. It clears only after the server accepts the name. */
function AddLookupForm({
  singular,
  onAdd,
}: {
  readonly singular: string;
  readonly onAdd: (name: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState("");

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onAdd(newName)) {
      setNewName("");
    }
  };

  return (
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
  );
}

/**
 * Button, Alt+Arrow and pointer-drag reordering for the active rows. One
 * reorder runs at a time and later requests wait for the saved order.
 */
function useActiveRowReorder(
  kind: LookupKind,
  rows: ReadonlyArray<LookupItem>,
  listRef: RefObject<HTMLUListElement | null>,
) {
  const actions = useLookupActions(kind);
  const reorder = useLookupReorder(rows);
  const requestFocus = useRowFocusAfterRefresh(listRef, rows);
  const drag = useLookupDrag(listRef, (draggedId, targetId) => {
    void reorder.run((current) => actions.dragReorder(current, draggedId, targetId));
  });

  const move = (id: string, direction: -1 | 1, restoreFocus: boolean) => {
    if (reorder.busy) {
      return;
    }
    requestFocus(restoreFocus ? id : null);
    void reorder.run((current) => actions.move(current, id, direction));
  };

  return { actions, busy: reorder.busy, drag, move };
}

/**
 * Editable card for either item types or priority levels. Supports adding,
 * renaming, button/Alt+Arrow/pointer-drag reordering, archiving and restoring.
 */
export function LookupListCard({ kind, rows }: LookupListCardProps) {
  const labels = lookupLabels(kind);
  const listRef = useRef<HTMLUListElement>(null);
  const { actions, busy, drag, move } = useActiveRowReorder(kind, rows, listRef);
  const { active, archived } = partitionLookups(rows);

  return (
    <SectionCard title={labels.title} description={labels.description} testId={labels.testId}>
      <ul
        ref={listRef}
        aria-label={`Active ${labels.listLabel}`}
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
            moveBusy={busy}
            isDragging={drag.dragState?.draggedId === row.id}
            dropEdge={dropEdgeFor(row.id, active, drag.dragState)}
            onDragStart={drag.startDrag}
            onMove={move}
            onRename={(target) => void actions.rename(target)}
            onArchive={(target) => void actions.archive(target)}
          />
        ))}
      </ul>
      <ArchivedRows
        archived={archived}
        listLabel={labels.listLabel}
        onRestore={(target) => void actions.restore(target)}
      />
      <AddLookupForm singular={labels.singular} onAdd={actions.add} />
    </SectionCard>
  );
}
