import { isBlankText } from "@task-tracker/contracts";
import { Input } from "@base-ui/react/input";
import type { StatusKind, StatusProjection } from "@task-tracker/contracts";
import { type FormEvent, useRef, useState } from "react";
import { UNSAVED_SETTINGS_UNDO_MESSAGE, useUndoBlocker } from "../shell/undo-blockers.js";
import { Button } from "../ui/button.js";
import { SectionCard } from "../ui/section-card.js";
import { Select } from "../ui/select.js";
import { useListReorder } from "../ui/use-list-reorder.js";
import { ArchivedRows } from "./lookup-list-card.js";
import { partitionLookups } from "./lookup-order.js";
import { LookupRow } from "./lookup-row.js";
import { useStatusActions } from "./use-status-actions.js";

type Status = typeof StatusProjection.Type;
type Kind = typeof StatusKind.Type;

const KIND_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "Done", label: "Done" },
] as const satisfies ReadonlyArray<{ value: Kind; label: string }>;

/** A new status name and its fixed kind. The name clears only after the server accepts it. */
function AddStatusForm({
  onAdd,
}: {
  readonly onAdd: (name: string, kind: Kind) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("Open");
  useUndoBlocker(!isBlankText(name), UNSAVED_SETTINGS_UNDO_MESSAGE);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onAdd(name, kind)) {
      setName("");
    }
  };

  return (
    <form className="flex items-center gap-2 pt-1" onSubmit={(event) => void handleAdd(event)}>
      <Input
        value={name}
        onValueChange={setName}
        placeholder="New name"
        aria-label="New status name"
        autoComplete="off"
        spellCheck={false}
        data-testid="lookup-new-name"
        className="h-9 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus"
      />
      <Select
        value={kind}
        onValueChange={setKind}
        options={KIND_OPTIONS}
        ariaLabel="Status kind"
        testId="status-new-kind"
      />
      <Button type="submit" data-testid="lookup-add">
        Add
      </Button>
    </form>
  );
}

/**
 * Editable workflow statuses for App Settings (§7.15). Each status is Open or Done,
 * fixed when added. Rows show their kind and support renaming, button, Alt+Arrow and
 * pointer-drag reordering, archiving and restoring. Changes save immediately.
 */
export function StatusListCard({ rows }: { readonly rows: ReadonlyArray<Status> }) {
  const listRef = useRef<HTMLUListElement>(null);
  const actions = useStatusActions();
  const items = rows.map((row) => ({ ...row, isBuiltIn: false }));
  const { active, archived } = partitionLookups(items);
  const { busy, drag, move } = useListReorder({
    listRef,
    rowAttribute: "data-lookup-row-id",
    rows,
    activeIds: active.map((row) => row.id),
    move: actions.move,
    dragReorder: actions.dragReorder,
  });

  return (
    <SectionCard
      title="Workflow statuses"
      description="Done statuses complete the item. Changes save immediately."
      testId="lookup-list-statuses"
    >
      <ul
        ref={listRef}
        aria-label="Active statuses"
        data-testid="lookup-active-list"
        className="flex flex-col"
      >
        {active.map((row, index) => (
          <LookupRow
            key={row.id}
            row={row}
            kind="statuses"
            detail={row.kind}
            isFirst={index === 0}
            isLast={index === active.length - 1}
            moveBusy={busy}
            isDragging={drag.draggedId === row.id}
            dropEdge={drag.dropEdgeFor(row.id)}
            onDragStart={drag.startDrag}
            onMove={move}
            onRename={(target) => void actions.rename(target)}
            onArchive={(target) => void actions.archive(target.id)}
          />
        ))}
      </ul>
      <ArchivedRows
        archived={archived}
        listLabel="statuses"
        onRestore={(target) => void actions.restore(target.id)}
      />
      <AddStatusForm onAdd={actions.add} />
    </SectionCard>
  );
}
