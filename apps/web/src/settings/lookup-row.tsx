import { Archive, ArrowDown, ArrowUp, GripVertical, Pencil } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { cx } from "../ui/class-names.js";
import { Tooltip } from "../ui/tooltip.js";
import type { DropEdge } from "../ui/use-pointer-reorder.js";
import { PriorityNumberForm } from "./priority-number-form.js";
import type { LookupItem, LookupKind } from "./use-lookup-actions.js";

/** Props for {@link LookupRow}. */
export interface LookupRowProps {
  readonly row: LookupItem;
  readonly kind: LookupKind | "statuses";
  /** Fixed secondary text after the name, such as a status kind. */
  readonly detail?: string | undefined;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** A reorder is saving. Move buttons stay focusable but ignore presses. */
  readonly moveBusy: boolean;
  readonly isDragging: boolean;
  readonly dropEdge: DropEdge;
  readonly onDragStart: (id: string, event: PointerEvent<HTMLButtonElement>) => void;
  readonly onMove: (id: string, direction: -1 | 1, restoreFocus: boolean) => void;
  readonly onRename: (row: LookupItem) => void;
  readonly onArchive: (row: LookupItem) => void;
  /** Saves a priority number. Only priority level rows show the number form. */
  readonly onSetNumber?: ((id: string, text: string) => Promise<boolean>) | undefined;
  /** The In progress mark of an Open status row (§7.18). Other rows show no box. */
  readonly inProgress?: InProgressMark | undefined;
}

/** Whether an Open status is marked In progress, and how to change it. */
export interface InProgressMark {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/** The In progress box on an Open status row, with what it does in its tooltip. */
function InProgressBox({ label, mark }: { readonly label: string; readonly mark: InProgressMark }) {
  return (
    <Tooltip content="Open items with this status show when you click the tray icon">
      <span className="mr-1.5 inline-flex">
        <Checkbox
          checked={mark.checked}
          onCheckedChange={mark.onChange}
          ariaLabel={`${label} is in progress`}
          testId="status-in-progress"
        >
          In progress
        </Checkbox>
      </span>
    </Tooltip>
  );
}

/**
 * One active row in a lookup list, with drag handle, type glyph (for item types),
 * Alt+Up/Down keyboard reorder and tooltipped action buttons.
 */
export function LookupRow({
  row,
  kind,
  detail,
  isFirst,
  isLast,
  moveBusy,
  isDragging,
  dropEdge,
  onDragStart,
  onMove,
  onRename,
  onArchive,
  onSetNumber,
  inProgress,
}: LookupRowProps) {
  const label = row.label ?? row.name;

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey) {
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onMove(row.id, -1, true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onMove(row.id, 1, true);
    }
  };

  return (
    <li
      aria-label={label}
      tabIndex={0}
      data-testid="lookup-row"
      data-lookup-row-id={row.id}
      onKeyDown={handleKeyDown}
      className={cx(
        "group flex h-10 items-center justify-between gap-2 border-b border-line px-1.5 outline-none last:border-b-0 focus-visible:rounded-control focus-visible:bg-hover",
        isDragging && "opacity-45",
        dropEdge === "before" && "border-t-2 border-t-accent",
        dropEdge === "after" && "border-b-2 border-b-accent",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Drag to reorder ${label}`}
          data-testid="lookup-drag-handle"
          onPointerDown={(event) => onDragStart(row.id, event)}
          className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-[0.25rem] text-fg-subtle hover:bg-hover hover:text-fg active:cursor-grabbing"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <span className="truncate text-sm text-fg">{label}</span>
        {detail === undefined ? null : (
          <span data-testid="lookup-row-detail" className="shrink-0 text-xs text-fg-subtle">
            · {detail}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {inProgress === undefined ? null : <InProgressBox label={label} mark={inProgress} />}
        {kind === "priorityLevels" && onSetNumber !== undefined ? (
          <PriorityNumberForm
            label={label}
            savedNumber={row.number ?? null}
            onSave={(text) => onSetNumber(row.id, text)}
          />
        ) : null}
        <Tooltip content="Move up">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isFirst || moveBusy}
            focusableWhenDisabled={!isFirst}
            aria-label={`Move ${label} up`}
            onClick={() => onMove(row.id, -1, false)}
            data-testid="lookup-move-up"
          >
            <ArrowUp size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip content="Move down">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isLast || moveBusy}
            focusableWhenDisabled={!isLast}
            aria-label={`Move ${label} down`}
            onClick={() => onMove(row.id, 1, false)}
            data-testid="lookup-move-down"
          >
            <ArrowDown size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip content="Rename">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Rename ${label}`}
            onClick={() => onRename(row)}
            data-testid="lookup-rename"
          >
            <Pencil size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip content="Archive" testId="lookup-archive-tooltip">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Archive ${label}`}
            onClick={() => onArchive(row)}
            data-testid="lookup-archive"
          >
            <Archive size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}
