import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Circle,
  CircleCheck,
  CornerDownRight,
  Ellipsis,
  GripVertical,
} from "lucide-react";
import type { MouseEvent, PointerEvent } from "react";
import { deadlineLabel, formatInstantDate } from "../format/item-dates.js";
import { cx } from "../ui/class-names.js";
import { ContextMenuContent, MenuContent } from "../ui/menu.js";
import { Tooltip } from "../ui/tooltip.js";
import { treeStyles } from "../ui/tree-styles.js";
import { ItemMenuItems } from "./item-menu-items.js";
import { isEmptyLevel, type ItemNode } from "./item-outline.js";
import { ItemTypeIcon } from "./item-type-icon.js";
import type { DropPlacement } from "./reorder-plan.js";
import { UrgencyBadge } from "./urgency-badge.js";
import type { ItemActions } from "./use-item-actions.js";

/** Names and zone an item row resolves its references with. */
export interface ItemRowLookups {
  readonly typeName: (typeId: string | null) => string | null;
  readonly priorityName: (priorityId: string | null) => string | null;
  readonly itemTitle: (itemId: string) => string | undefined;
  readonly timeZone: string;
}

/** Props for {@link ItemRow}. */
export interface ItemRowProps {
  readonly node: ItemNode;
  readonly depth: number;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly menuOpen: boolean;
  readonly canIndent: boolean;
  readonly hasFolders: boolean;
  readonly dragging: boolean;
  readonly dropIndicator: DropPlacement | null;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly onSelect: () => void;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onStartDrag: (event: PointerEvent<HTMLButtonElement>) => void;
}

/** Shared column layout so detail columns align at every nesting level. */
export const ITEM_ROW_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_10.5rem_8rem_1.75rem] items-center gap-3";

function DragHandle({
  node,
  onStartDrag,
}: {
  readonly node: ItemNode;
  readonly onStartDrag: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  if (node.isFinished) {
    return <span className="w-4 shrink-0" aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Reorder ${node.item.title}`}
      data-testid="item-drag-handle"
      onPointerDown={onStartDrag}
      onClick={(event) => event.stopPropagation()}
      className="grid h-5 w-4 shrink-0 cursor-grab place-items-center rounded-[0.3125rem] text-fg-subtle opacity-0 group-hover/row:opacity-100 hover:bg-pressed hover:text-fg active:cursor-grabbing"
    >
      <GripVertical size={13} aria-hidden="true" />
    </button>
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

function CompletionMark({
  title,
  completed,
  onToggle,
}: {
  readonly title: string;
  readonly completed: boolean;
  readonly onToggle: () => void;
}) {
  const Icon = completed ? CircleCheck : Circle;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={completed ? `Reopen ${title}` : `Complete ${title}`}
      data-testid="item-completion"
      data-completed={completed}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cx(
        "grid size-5 shrink-0 cursor-default place-items-center rounded-full transition-colors hover:bg-pressed",
        completed ? "text-accent" : "text-control-outline hover:text-fg-muted",
      )}
    >
      <Icon size={16} strokeWidth={completed ? 2.25 : 1.75} aria-hidden="true" />
    </button>
  );
}

function dateCell(node: ItemNode, timeZone: string) {
  if (node.isFinished && node.item.completedAtUtc !== null) {
    return {
      icon: CircleCheck,
      text: `Done ${formatInstantDate(node.item.completedAtUtc, timeZone)}`,
      spoken: null,
    };
  }
  const deadline = deadlineLabel(node.item);
  if (deadline === null) {
    return null;
  }
  const due = deadline.kind === "due";
  return {
    icon: due ? CalendarDays : CalendarClock,
    text: deadline.text,
    spoken: `${due ? "Due" : "Scheduled"} ${deadline.text}`,
  };
}

function UrgencySource({ title }: { readonly title: string }) {
  const label = `From sub-item: ${title}`;
  return (
    <Tooltip content={label} testId="urgency-source-tooltip">
      <span
        role="img"
        aria-label={label}
        data-testid="urgency-source"
        className="grid size-5 place-items-center rounded-full text-fg-subtle hover:bg-hover"
      >
        <CornerDownRight size={12} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

function describe(
  node: ItemNode,
  lookups: ItemRowLookups,
  spokenDate: string | null,
  source: string | undefined,
) {
  const urgency = node.displayedUrgency.value;
  return [
    node.item.completedAtUtc === null ? "Open" : "Completed",
    lookups.typeName(node.item.itemTypeId),
    node.item.ticketNumber,
    lookups.priorityName(node.item.priorityLevelId),
    spokenDate,
    urgency === "None" ? null : urgency,
    source === undefined ? null : `from sub-item ${source}`,
  ]
    .filter((part) => part !== null && part !== "")
    .join(", ");
}

function ItemTitle({ node }: { readonly node: ItemNode }) {
  const completed = node.item.completedAtUtc !== null;
  return (
    <span
      id={`item-title-${node.item.id}`}
      data-testid="item-title"
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

function DateCell({ date }: { readonly date: ReturnType<typeof dateCell> }) {
  const Icon = date?.icon;
  return (
    <span
      data-testid="item-date"
      className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-muted"
    >
      {Icon === undefined ? null : (
        <Icon size={13} aria-hidden="true" className="shrink-0 text-fg-subtle" />
      )}
      <span className="truncate">{date?.text}</span>
    </span>
  );
}

/** The title of the sub-item a rolled-up urgency comes from, if any. */
function urgencySourceTitle(node: ItemNode, lookups: ItemRowLookups) {
  const { value, sourceDescendantId } = node.displayedUrgency;
  return value === "None" || sourceDescendantId === null
    ? undefined
    : lookups.itemTitle(sourceDescendantId);
}

function DetailCells({ node, lookups }: Pick<ItemRowProps, "node" | "lookups">) {
  const date = dateCell(node, lookups.timeZone);
  const source = urgencySourceTitle(node, lookups);
  return (
    <>
      <span data-testid="item-ticket" className="truncate text-xs text-fg-muted tabular-nums">
        {node.item.ticketNumber}
      </span>
      <span data-testid="item-priority" className="truncate text-[13px] text-fg-muted">
        {lookups.priorityName(node.item.priorityLevelId)}
      </span>
      <DateCell date={date} />
      <span className="flex items-center gap-1">
        <UrgencyBadge urgency={node.displayedUrgency.value} />
        {source === undefined ? null : <UrgencySource title={source} />}
      </span>
      <span id={`item-details-${node.item.id}`} className="sr-only">
        {describe(node, lookups, date?.spoken ?? date?.text ?? null, source)}
      </span>
    </>
  );
}

function ItemOverflowMenu({
  node,
  menuOpen,
  canIndent,
  hasFolders,
  actions,
  onMenuOpenChange,
}: Pick<
  ItemRowProps,
  "node" | "menuOpen" | "canIndent" | "hasFolders" | "actions" | "onMenuOpenChange"
>) {
  return (
    <Menu.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
      <Menu.Trigger
        tabIndex={-1}
        aria-label={`Actions for ${node.item.title}`}
        data-testid="item-menu"
        onClick={(event) => event.stopPropagation()}
        className="grid size-6 shrink-0 cursor-default place-items-center justify-self-end rounded-[0.3125rem] text-fg-subtle opacity-0 group-hover/row:opacity-100 hover:bg-pressed hover:text-fg data-popup-open:opacity-100"
      >
        <Ellipsis size={14} aria-hidden="true" />
      </Menu.Trigger>
      <MenuContent testId="item-menu-popup">
        <ItemMenuItems
          node={node}
          canIndent={canIndent}
          hasFolders={hasFolders}
          actions={actions}
        />
      </MenuContent>
    </Menu.Root>
  );
}

/**
 * One item's row: drag handle, expand chevron, completion button, type, title,
 * ticket, priority, due or scheduled date, urgency with sub-item attribution,
 * and overflow/context actions.
 */
export function ItemRow(props: ItemRowProps) {
  const {
    node,
    depth,
    expanded,
    selected,
    canIndent,
    hasFolders,
    dragging,
    dropIndicator,
    lookups,
    actions,
    onSelect,
    onExpandedChange,
    onStartDrag,
  } = props;
  const dragParent = node.isFinished ? undefined : (node.item.parentItemId ?? "root");
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        data-tree-row=""
        data-testid="item-row"
        data-item-row-id={node.item.id}
        data-drag-parent={dragParent}
        onClick={onSelect}
        className={cx(
          ITEM_ROW_COLUMNS,
          "group/row relative h-9 cursor-default rounded-control pr-2 transition-colors",
          selected ? "bg-accent-soft" : "hover:bg-hover",
          node.isFinished && "text-fg-muted",
          dragging && "opacity-50",
        )}
      >
        {dropIndicator === null ? null : (
          <span
            aria-hidden="true"
            data-testid="drop-indicator"
            className={cx(
              "pointer-events-none absolute right-2 left-2 h-0.5 rounded-full bg-accent",
              dropIndicator === "before" ? "top-0" : "bottom-0",
            )}
          />
        )}
        <div
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: `${0.25 + depth * 1.5}rem` }}
        >
          <DragHandle node={node} onStartDrag={onStartDrag} />
          <ExpandToggle node={node} expanded={expanded} onExpandedChange={onExpandedChange} />
          <CompletionMark
            title={node.item.title}
            completed={node.item.completedAtUtc !== null}
            onToggle={() => void actions.toggleComplete(node)}
          />
          <ItemTypeIcon name={lookups.typeName(node.item.itemTypeId)} />
          <ItemTitle node={node} />
        </div>
        <DetailCells node={node} lookups={lookups} />
        <ItemOverflowMenu {...props} />
      </ContextMenu.Trigger>
      <ContextMenuContent testId="item-context-menu">
        <ItemMenuItems
          node={node}
          canIndent={canIndent}
          hasFolders={hasFolders}
          actions={actions}
        />
      </ContextMenuContent>
    </ContextMenu.Root>
  );
}
