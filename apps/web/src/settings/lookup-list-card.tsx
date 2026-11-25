import { isBlankText } from "@task-tracker/contracts";
import { Input } from "@base-ui/react/input";
import { type FormEvent, type RefObject, useRef, useState } from "react";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { Button } from "../ui/button.js";
import { fieldStyles } from "../ui/field-styles.js";
import { SectionCard } from "../ui/section-card.js";
import { useListReorder } from "../ui/use-list-reorder.js";
import { partitionLookups } from "./lookup-order.js";
import { LookupRow } from "./lookup-row.js";
import { type LookupItem, type LookupKind, useLookupActions } from "./use-lookup-actions.js";

const ROW_ATTRIBUTE = "data-lookup-row-id";

/** Props for {@link LookupListCard}. */
export interface LookupListCardProps {
  readonly kind: LookupKind;
  readonly rows: ReadonlyArray<LookupItem>;
}

/** Visible text and test IDs for one lookup list. */
function lookupLabels(_kind: LookupKind) {
  return {
    title: "Priority levels",
    description: "Top of the list is the most important. Changes save immediately.",
    listLabel: "priority levels",
    singular: "priority level",
    testId: "lookup-list-priority-levels",
  };
}

/** Archived rows of a lookup list, each with a Restore button. */
export function ArchivedRows({
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
            aria-label={row.label ?? row.name}
            data-testid="lookup-archived-row"
            className="flex h-8 items-center justify-between gap-2 px-1.5 text-sm text-fg-subtle"
          >
            <span className="truncate">{row.label ?? row.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Restore ${row.label ?? row.name}`}
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
  isPriority,
  onAdd,
}: {
  readonly singular: string;
  readonly isPriority: boolean;
  readonly onAdd: (name: string, number: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  useUndoBlocker(!isBlankText(newName) || newNumber !== "", UNSAVED_SETTINGS_UNDO_MESSAGE);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onAdd(newName, newNumber)) {
      setNewName("");
      setNewNumber("");
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
      {isPriority ? (
        <Input
          value={newNumber}
          onValueChange={setNewNumber}
          placeholder="Number"
          aria-label="New priority number"
          autoComplete="off"
          inputMode="numeric"
          data-testid="priority-new-number"
          className={`${fieldStyles.control} max-w-24`}
        />
      ) : null}
      <Button type="submit" data-testid="lookup-add">
        Add
      </Button>
    </form>
  );
}

/** The list actions plus button, Alt+Arrow and pointer-drag reordering of the active rows. */
function useActiveRowReorder(
  kind: LookupKind,
  rows: ReadonlyArray<LookupItem>,
  listRef: RefObject<HTMLUListElement | null>,
) {
  const actions = useLookupActions(kind);
  const reorder = useListReorder({
    listRef,
    rowAttribute: ROW_ATTRIBUTE,
    rows,
    activeIds: partitionLookups(rows).active.map((row) => row.id),
    move: actions.move,
    dragReorder: actions.dragReorder,
  });
  return { actions, ...reorder };
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
            isDragging={drag.draggedId === row.id}
            dropEdge={drag.dropEdgeFor(row.id)}
            onDragStart={drag.startDrag}
            onMove={move}
            onRename={(target) => void actions.rename(target)}
            onArchive={(target) => void actions.archive(target)}
            onSetNumber={actions.setNumber}
          />
        ))}
      </ul>
      <ArchivedRows
        archived={archived}
        listLabel={labels.listLabel}
        onRestore={(target) => void actions.restore(target)}
      />
      <AddLookupForm
        singular={labels.singular}
        isPriority={kind === "priorityLevels"}
        onAdd={actions.add}
      />
    </SectionCard>
  );
}
