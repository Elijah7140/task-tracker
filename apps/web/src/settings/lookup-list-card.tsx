import { Input } from "@base-ui/react/input";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "../ui/button.js";
import { SectionCard } from "../ui/section-card.js";
import { partitionLookups } from "./lookup-order.js";
import { type DropEdge, LookupRow } from "./lookup-row.js";
import { type LookupItem, type LookupKind, useLookupActions } from "./use-lookup-actions.js";

/** Props for {@link LookupListCard}. */
export interface LookupListCardProps {
  readonly kind: LookupKind;
  readonly rows: ReadonlyArray<LookupItem>;
}

function findRowIdAtY(list: HTMLUListElement | null, clientY: number): string | null {
  if (list === null) {
    return null;
  }
  const elements = list.querySelectorAll<HTMLElement>("[data-lookup-row-id]");
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const id = element.dataset["lookupRowId"] ?? null;
    if (id === null) {
      continue;
    }
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return id;
    }
    const distance = Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = id;
    }
  }
  return nearestId;
}

function dropEdgeFor(
  rowId: string,
  active: ReadonlyArray<LookupItem>,
  dragState: { readonly draggedId: string; readonly overId: string | null } | null,
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
  const [dragState, setDragState] = useState<{
    readonly draggedId: string;
    readonly overId: string | null;
  } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const actions = useLookupActions(kind);
  const { active, archived } = partitionLookups(rows);

  useEffect(() => {
    const focusId = pendingFocusIdRef.current;
    if (focusId === null) {
      return;
    }
    pendingFocusIdRef.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-lookup-row-id="${focusId}"]`)?.focus();
  }, [rows]);

  useEffect(() => {
    if (dragState === null) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const overId = findRowIdAtY(listRef.current, event.clientY);
      setDragState((current) => (current === null ? null : { ...current, overId }));
    };
    const handleUp = (event: PointerEvent) => {
      const targetId = findRowIdAtY(listRef.current, event.clientY);
      const draggedId = dragState.draggedId;
      setDragState(null);
      if (targetId !== null && targetId !== draggedId) {
        void actions.dragReorder(rows, draggedId, targetId);
      }
    };
    const handleCancel = () => setDragState(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [dragState, actions, rows]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await actions.add(newName)) {
      setNewName("");
    }
  };

  const handleMove = (id: string, direction: -1 | 1, restoreFocus: boolean) => {
    pendingFocusIdRef.current = restoreFocus ? id : null;
    void actions.move(rows, id, direction);
  };

  const handleDragStart = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragState({ draggedId: id, overId: id });
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
            isDragging={dragState?.draggedId === row.id}
            dropEdge={dropEdgeFor(row.id, active, dragState)}
            onDragStart={handleDragStart}
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
