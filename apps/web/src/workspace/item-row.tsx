import { ContextMenu } from "@base-ui/react/context-menu";
import { ChevronRight, GripVertical } from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { cx } from "../ui/class-names.js";
import { ContextMenuContent } from "../ui/menu.js";
import { treeStyles } from "../ui/tree-styles.js";
import { ItemMenuItems } from "./item-menu-items.js";
import { isEmptyLevel, type ItemNode } from "./item-outline.js";
import {
  CompletionMark,
  dateCell,
  type ItemDate,
  ItemDescription,
  ItemOverflowMenu,
  type ItemRowLookups,
  statusName,
  UrgencySource,
  urgencySourceTitle,
} from "./item-parts.js";
import { ItemStatusChip } from "./item-status-chip.js";
import { ItemTypeIcon } from "./item-type-icon.js";
import { UrgencyBadge } from "./urgency-badge.js";
import type { ItemActions } from "./use-item-actions.js";
import type { ItemDropPosition } from "./use-item-drag.js";

/** Props for {@link ItemRow}. */
export interface ItemRowProps {
  readonly node: ItemNode;
  /** Nesting depth below the card: 1 for the card's direct sub-items. */
  readonly depth: number;
  readonly expanded: boolean;
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
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onMenuOpenChange: (open: boolean) => void;
  /** A left-button press anywhere on the row that may become a drag (§7.5). */
  readonly onStartDrag: (event: PointerEvent<HTMLElement>) => void;
}

/**
 * The grip shown on hover. The whole row starts a drag; the grip only signals
 * it, so assistive technology skips it and the keyboard moves rows with
 * Alt+arrows and Tab instead (§8).
 */
function DragHandle() {
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

function ExpandToggle({
  node,
  expanded,
  onExpandedChange,
}: Pick<ItemRowProps, "node" | "expanded" | "onExpandedChange">) {
  if (isEmptyLevel(node.children)) {
    return <span className="size-5 shrink-0" aria-hidden="true" />;
  }
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    onExpandedChange(!expanded);
  };
  return (
    <span
      aria-hidden="true"
      data-testid="item-toggle"
      onClick={toggle}
      className={cx(treeStyles.chevron, expanded && "rotate-90")}
    >
      <ChevronRight size={14} />
    </span>
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
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 pl-17 text-xs text-fg-muted"
    >
      {parts.flatMap((part, index) => (index === 0 ? [part] : [DETAIL_SEPARATOR, part]))}
    </div>
  );
}

function RowContent(props: ItemRowProps) {
  const { node, expanded, lookups, actions, onExpandedChange } = props;
  const date = dateCell(node, lookups.timeZone);
  const source = urgencySourceTitle(node, lookups);
  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <DragHandle />
        <ExpandToggle node={node} expanded={expanded} onExpandedChange={onExpandedChange} />
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
          <ItemOverflowMenu {...props} />
        </span>
      </div>
      <RowDetails node={node} lookups={lookups} date={date} />
      <ItemDescription node={node} lookups={lookups} date={date} />
    </>
  );
}

/**
 * A sub-item row inside a workspace card (§7.17): drag handle, expand chevron, completion
 * button, type, title, status chip, urgency with sub-item attribution and the actions menu,
 * then a details line with the ticket, priority and date. Each nesting level indents it.
 */
export function ItemRow(props: ItemRowProps) {
  const { node, depth, selected, canIndent, hasFolders, dragging, dropIndicator } = props;
  const { lookups, actions, onSelect, onStartDrag } = props;
  return (
    <ContextMenu.Root>
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
        style={{ paddingLeft: `${Math.max(0, depth - 1) * 0.875}rem` }}
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
