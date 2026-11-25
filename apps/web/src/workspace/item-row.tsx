import { ContextMenu } from "@base-ui/react/context-menu";
import { GripVertical, Plus } from "lucide-react";
import type { PointerEvent } from "react";
import { cx } from "../ui/class-names.js";
import { ContextMenuContent } from "../ui/menu.js";
import { ItemMenuItems } from "./item-menu-items.js";
import type { ItemNode } from "./item-outline.js";
import {
  CompletionMark,
  dateCell,
  type ItemDate,
  ItemDescription,
  ItemOverflowMenu,
  type ItemRowLookups,
  RepeatMarker,
  repeatSummary,
  statusName,
  UrgencySource,
  urgencySourceTitle,
} from "./item-parts.js";
import { ItemStatusChip } from "./item-status-chip.js";
import { useItemSurface } from "./item-surface.js";
import { ItemTypeIcon } from "./item-type-icon.js";
import { UrgencyBadge } from "./urgency-badge.js";
import type { ItemActions } from "./use-item-actions.js";
import type { ItemDropPosition } from "./use-item-drag.js";

/** The left padding, in rem, of a card outline line at `depth` (1 for direct sub-items). */
export function outlineIndent(depth: number) {
  return Math.max(0, depth - 1) * 1.25;
}

/** Props for {@link ItemRow}. */
export interface ItemRowProps {
  readonly node: ItemNode;
  /** Nesting depth below the card: 1 for the card's direct sub-items. */
  readonly depth: number;
  readonly selected: boolean;
  readonly menuOpen: boolean;
  readonly canIndent: boolean;
  readonly hasFolders: boolean;
  readonly dragging: boolean;
  /** Drop feedback while this row is the target of an item drag. */
  readonly dropIndicator: ItemDropPosition | null;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly onSelect: () => void;
  /** Opens the inline add line under this row (§7.17); absent for finished rows. */
  readonly onInlineAdd?: (() => void) | undefined;
  readonly onMenuOpenChange: (open: boolean) => void;
  /** A left-button press anywhere on the row that may become a drag (§7.5). */
  readonly onStartDrag: (event: PointerEvent<HTMLElement>) => void;
}

/**
 * The grip shown on hover. The whole row starts a drag; the grip only signals
 * it, so assistive technology skips it and the keyboard moves rows with
 * Alt+arrows and Tab instead (§8). Tray cards do not drag, so there it only keeps the space.
 */
function DragHandle() {
  const surface = useItemSurface();
  if (surface === "tray") {
    return <span aria-hidden="true" className="w-4 shrink-0" />;
  }
  return (
    <span
      aria-hidden="true"
      data-testid="item-drag-handle"
      className="grid h-5 w-4 shrink-0 cursor-grab place-items-center rounded-[0.3125rem] text-fg-subtle opacity-0 group-hover/row:opacity-100 hover:bg-pressed hover:text-fg active:cursor-grabbing"
    >
      <GripVertical size={13} />
    </span>
  );
}

/** An insertion edge before or after the row, or the "Make sub-item" label for an into drop. */
function DropFeedback({ position }: { readonly position: ItemDropPosition | null }) {
  if (position === null) {
    return null;
  }
  if (position === "into") {
    return (
      <span
        aria-hidden="true"
        data-testid="drop-indicator"
        data-placement="into"
        className="pointer-events-none absolute top-1/2 right-8 -translate-y-1/2 rounded-full bg-accent px-2 py-0.5 text-[11px] leading-4 font-medium text-on-accent"
      >
        Make sub-item
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="drop-indicator"
      data-placement={position}
      className={cx(
        "pointer-events-none absolute right-2 left-2 h-0.5 rounded-full bg-accent",
        position === "before" ? "top-0" : "bottom-0",
      )}
    />
  );
}

/**
 * The "+" shown on hover or selection that opens the outline's add line under the row
 * (§7.17). Like the other hover actions it never takes a Tab stop (§8).
 */
function InlineAddButton({
  title,
  selected,
  onInlineAdd,
}: {
  readonly title: string;
  readonly selected: boolean;
  readonly onInlineAdd: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Add a ToDo after ${title}`}
      data-testid="item-inline-add"
      onClick={(event) => {
        event.stopPropagation();
        onInlineAdd();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cx(
        "grid size-5 shrink-0 cursor-default place-items-center rounded-full text-fg-subtle hover:bg-pressed hover:text-fg",
        selected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
      )}
    >
      <Plus size={13} aria-hidden="true" />
    </button>
  );
}

function ItemTitle({ node }: { readonly node: ItemNode }) {
  const completed = node.item.completedAtUtc !== null;
  return (
    <span
      id={`item-title-${node.item.id}`}
      data-testid="item-title"
      title={node.item.title}
      className={cx(
        "min-w-0 truncate pl-0.5",
        node.displayedUrgency.value === "Overdue" && !completed && "font-semibold",
        completed && "text-fg-subtle line-through",
      )}
    >
      {node.item.title}
    </span>
  );
}

const DETAIL_SEPARATOR = (
  <span aria-hidden="true" className="text-fg-subtle">
    ·
  </span>
);

/**
 * The second line of a sub-item row: ticket, priority and date, so the title keeps the
 * card's width (§7.17). Nothing renders when the item has none of them.
 */
function RowDetails({
  node,
  lookups,
  date,
}: {
  readonly node: ItemNode;
  readonly lookups: ItemRowLookups;
  readonly date: ItemDate;
}) {
  const priority = lookups.priorityName(node.item.priorityLevelId);
  const DateIcon = date?.icon;
  const parts = [
    node.item.ticketNumber === null ? null : (
      <span key="ticket" data-testid="item-ticket" className="tabular-nums">
        {node.item.ticketNumber}
      </span>
    ),
    priority === null ? null : (
      <span key="priority" data-testid="item-priority">
        {priority}
      </span>
    ),
    date === null ? null : (
      <span key="date" data-testid="item-date" className="inline-flex items-center gap-1">
        {DateIcon === undefined ? null : (
          <DateIcon size={12} aria-hidden="true" className="shrink-0 text-fg-subtle" />
        )}
        {date.text}
      </span>
    ),
  ].filter((part) => part !== null);
  if (parts.length === 0) {
    return null;
  }
  return (
    <div
      data-testid="item-row-details"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 pl-11 text-xs text-fg-muted"
    >
      {parts.flatMap((part, index) => (index === 0 ? [part] : [DETAIL_SEPARATOR, part]))}
    </div>
  );
}

function RowContent(props: ItemRowProps) {
  const { node, selected, lookups, actions, onInlineAdd } = props;
  const date = dateCell(node, lookups.timeZone);
  const source = urgencySourceTitle(node, lookups);
  const repeat = repeatSummary(node);
  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <DragHandle />
        <CompletionMark
          title={node.item.title}
          completed={node.item.completedAtUtc !== null}
          onToggle={() => void actions.toggleComplete(node)}
        />
        <ItemTypeIcon name={lookups.typeName(node.item.itemTypeId)} />
        <ItemTitle node={node} />
        <ItemStatusChip name={statusName(node, lookups)} />
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <UrgencyBadge urgency={node.displayedUrgency.value} />
          {source === undefined ? null : <UrgencySource title={source} />}
          {repeat === null ? null : <RepeatMarker summary={repeat} />}
          {onInlineAdd === undefined ? null : (
            <InlineAddButton
              title={node.item.title}
              selected={selected}
              onInlineAdd={onInlineAdd}
            />
          )}
          <ItemOverflowMenu {...props} />
        </span>
      </div>
      <RowDetails node={node} lookups={lookups} date={date} />
      <ItemDescription node={node} lookups={lookups} date={date} />
    </>
  );
}

/**
 * A sub-item row inside a workspace card (§7.17): drag handle, completion button, type (none
 * for an untyped item), title, status chip, urgency with sub-item attribution, the inline add
 * "+" and the actions menu, then a details line with the ticket, priority and date. Rows read
 * as a dotted list: one circle per item, and each nesting level only indents the row.
 */
export function ItemRow(props: ItemRowProps) {
  const { node, depth, selected, canIndent, hasFolders, dragging, dropIndicator } = props;
  const { lookups, actions, onSelect, onStartDrag } = props;
  const surface = useItemSurface();
  return (
    <ContextMenu.Root disabled={surface === "tray"}>
      <ContextMenu.Trigger
        data-tree-row=""
        data-testid="item-row"
        data-item-row-id={node.item.id}
        data-dragging={dragging ? "true" : undefined}
        data-drop-into={dropIndicator === "into" ? "true" : undefined}
        onClick={onSelect}
        onDoubleClick={(event) => {
          event.stopPropagation();
          actions.editItem(node);
        }}
        onPointerDown={onStartDrag}
        style={{ paddingLeft: `${outlineIndent(depth)}rem` }}
        className={cx(
          "group/row relative flex min-h-7 min-w-0 cursor-default flex-col justify-center rounded-control py-0.5 pr-1 text-[13px] transition-colors",
          dropIndicator === "into"
            ? "bg-accent/15 ring-1 ring-accent/60 ring-inset"
            : selected
              ? "bg-accent-soft"
              : "hover:bg-hover",
          node.isFinished && "text-fg-muted",
          dragging && "opacity-50",
        )}
      >
        <DropFeedback position={dropIndicator} />
        <RowContent {...props} />
      </ContextMenu.Trigger>
      <ContextMenuContent testId="item-context-menu">
        <ItemMenuItems
          node={node}
          canIndent={canIndent}
          hasFolders={hasFolders}
          priorityLevels={lookups.priorityLevels}
          statuses={lookups.statuses}
          actions={actions}
        />
      </ContextMenuContent>
    </ContextMenu.Root>
  );
}
