import { Check, Pencil, X } from "lucide-react";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { type BatchEntry, entryLabel } from "./ticket-batch-entries.js";

/** Props for {@link TicketBatchList}. */
export interface TicketBatchListProps {
  readonly entries: ReadonlyArray<BatchEntry>;
  readonly rejectedKey: string | null;
  /** False while the form holds typing, which Edit would otherwise replace. */
  readonly canEdit: boolean;
  readonly onEdit: (key: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onDone: () => void;
  readonly saving: boolean;
  readonly error: string | null;
}

function EntryRow({
  entry,
  rejected,
  canEdit,
  onEdit,
  onRemove,
}: {
  readonly entry: BatchEntry;
  readonly rejected: boolean;
  readonly canEdit: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}) {
  const label = entryLabel(entry);
  return (
    <li
      data-testid="ticket-batch-entry"
      data-rejected={rejected ? "true" : undefined}
      aria-invalid={rejected ? true : undefined}
      className={cx(
        "flex items-center gap-1 rounded-control border px-2.5 py-1.5",
        rejected ? "border-danger bg-danger-soft" : "border-line bg-canvas",
      )}
    >
      <span data-testid="ticket-batch-entry-label" title={label} className="mr-auto truncate">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit ${label}`}
        title={canEdit ? "Edit" : "Add or clear the form first"}
        disabled={!canEdit}
        onClick={onEdit}
        data-testid="ticket-batch-entry-edit"
      >
        <Pencil size={14} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label}`}
        title="Remove"
        onClick={onRemove}
        data-testid="ticket-batch-entry-remove"
      >
        <X size={14} aria-hidden="true" />
      </Button>
    </li>
  );
}

function EmptyList() {
  return (
    <p data-testid="ticket-batch-empty" className="text-[13px] text-fg-muted">
      Fill in a ticket and press Add. Tickets wait here until you press Done.
    </p>
  );
}

/**
 * The right column: the tickets added so far, each with Edit and Remove, and Done at the
 * bottom right, which adds every listed ticket to Task Tracker and closes the view (§7.20).
 */
export function TicketBatchList({
  entries,
  rejectedKey,
  canEdit,
  onEdit,
  onRemove,
  onDone,
  saving,
  error,
}: TicketBatchListProps) {
  return (
    <section
      aria-labelledby="ticket-batch-list-heading"
      data-testid="ticket-batch-list"
      className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-line bg-raised"
    >
      <h2
        id="ticket-batch-list-heading"
        className="px-5 pt-4 pb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase"
      >
        To add ({entries.length})
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {entries.length === 0 ? (
          <EmptyList />
        ) : (
          <ol aria-label="Tickets to add" className="flex flex-col gap-1.5 text-[13px]">
            {entries.map((entry) => (
              <EntryRow
                key={entry.key}
                entry={entry}
                rejected={entry.key === rejectedKey}
                canEdit={canEdit}
                onEdit={() => onEdit(entry.key)}
                onRemove={() => onRemove(entry.key)}
              />
            ))}
          </ol>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-5 py-3">
        <p
          role="alert"
          data-testid={error === null ? undefined : "ticket-batch-error"}
          className="mr-auto min-w-0 text-[13px] text-danger"
        >
          {error}
        </p>
        <Button
          variant="primary"
          disabled={entries.length === 0 || saving}
          onClick={onDone}
          data-testid="ticket-batch-done"
        >
          <Check size={14} aria-hidden="true" />
          Done
        </Button>
      </footer>
    </section>
  );
}
