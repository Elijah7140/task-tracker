import { Archive, ArrowDown, ArrowUp, GripVertical, Pencil } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { Tooltip } from "../ui/tooltip.js";
import { ItemTypeIcon } from "../workspace/item-type-icon.js";
import type { LookupItem, LookupKind } from "./use-lookup-actions.js";

/** Drop placement relative to a hovered row during pointer drag. */
export type DropEdge = "before" | "after" | null;

/** Props for {@link LookupRow}. */
export interface LookupRowProps {
  readonly row: LookupItem;
  readonly kind: LookupKind;
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
}

/**
 * One active row in a lookup list, with drag handle, type glyph (for item types),
 * Alt+Up/Down keyboard reorder and tooltipped action buttons.
 */
export function LookupRow({
  row,
  kind,
  isFirst,
  isLast,
  moveBusy,
  isDragging,
  dropEdge,
  onDragStart,
  onMove,
  onRename,
  onArchive,
}: LookupRowProps) {
  const isItemType = kind === "itemTypes";
  const canArchive = !(isItemType && row.isBuiltIn);
  const archiveTooltip = canArchive ? "Archive" : "Built-in types can't be archived";

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
      aria-label={row.name}
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
          aria-label={`Drag to reorder ${row.name}`}
          data-testid="lookup-drag-handle"
          onPointerDown={(event) => onDragStart(row.id, event)}
          className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-[0.25rem] text-fg-subtle hover:bg-hover hover:text-fg active:cursor-grabbing"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        {isItemType ? <ItemTypeIcon name={row.name} /> : null}
        <span className="truncate text-sm text-fg">{row.name}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip content="Move up">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isFirst || moveBusy}
            focusableWhenDisabled={!isFirst}
            aria-label={`Move ${row.name} up`}
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
            aria-label={`Move ${row.name} down`}
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
            aria-label={`Rename ${row.name}`}
            onClick={() => onRename(row)}
            data-testid="lookup-rename"
          >
            <Pencil size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
        <Tooltip content={archiveTooltip} testId="lookup-archive-tooltip">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canArchive}
            focusableWhenDisabled
            aria-label={`Archive ${row.name}`}
            onClick={() => {
              if (canArchive) {
                onArchive(row);
              }
            }}
            data-testid="lookup-archive"
          >
            <Archive size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}
