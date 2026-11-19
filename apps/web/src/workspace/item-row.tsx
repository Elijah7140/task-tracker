import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Circle,
  CircleCheck,
  CornerDownRight,
} from "lucide-react";
import type { MouseEvent } from "react";
import { deadlineLabel, formatInstantDate } from "../format/item-dates.js";
import { cx } from "../ui/class-names.js";
import { Tooltip } from "../ui/tooltip.js";
import { treeStyles } from "../ui/tree-styles.js";
import type { ItemNode } from "./item-outline.js";
import { ItemTypeIcon } from "./item-type-icon.js";
import { UrgencyBadge } from "./urgency-badge.js";

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
  readonly lookups: ItemRowLookups;
  readonly onSelect: () => void;
  readonly onExpandedChange: (expanded: boolean) => void;
}

/** Shared column layout so detail columns align at every nesting level. */
export const ITEM_ROW_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_10.5rem_8rem] items-center gap-3";

function ExpandToggle({
  node,
  expanded,
  onExpandedChange,
}: Pick<ItemRowProps, "node" | "expanded" | "onExpandedChange">) {
  if (node.children.length === 0) {
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

function CompletionMark({ completed }: { readonly completed: boolean }) {
  const Icon = completed ? CircleCheck : Circle;
  return (
    <span
      aria-hidden="true"
      data-testid="item-completion"
      data-completed={completed}
      className={cx(
        "grid size-5 shrink-0 place-items-center",
        completed ? "text-accent" : "text-line-strong",
      )}
    >
      <Icon size={16} strokeWidth={completed ? 2.25 : 1.75} />
    </span>
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

/**
 * One item's row: expand chevron, completion mark, type, title, ticket,
 * priority, due or scheduled date and urgency with sub-item attribution.
 * Overdue titles are bold and completed titles are struck through.
 */
export function ItemRow(props: ItemRowProps) {
  const { node, depth, expanded, selected, lookups, onSelect, onExpandedChange } = props;
  return (
    <div
      data-tree-row=""
      data-testid="item-row"
      onClick={onSelect}
      className={cx(
        ITEM_ROW_COLUMNS,
        "h-9 cursor-default rounded-control pr-2 transition-colors",
        selected ? "bg-accent-soft" : "hover:bg-hover",
        node.isFinished && "text-fg-muted",
      )}
    >
      <div
        className="flex min-w-0 items-center gap-1.5"
        style={{ paddingLeft: `${0.25 + depth * 1.5}rem` }}
      >
        <ExpandToggle node={node} expanded={expanded} onExpandedChange={onExpandedChange} />
        <CompletionMark completed={node.item.completedAtUtc !== null} />
        <ItemTypeIcon name={lookups.typeName(node.item.itemTypeId)} />
        <ItemTitle node={node} />
      </div>
      <DetailCells node={node} lookups={lookups} />
    </div>
  );
}
