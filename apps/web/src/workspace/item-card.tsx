import { ContextMenu } from "@base-ui/react/context-menu";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
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
  statusName,
  UrgencySource,
  urgencySourceTitle,
} from "./item-parts.js";
import { ItemStatusChip } from "./item-status-chip.js";
import { ItemTypeIcon } from "./item-type-icon.js";
import { type Urgency, UrgencyBadge } from "./urgency-badge.js";
import type { ItemActions } from "./use-item-actions.js";
import type { ItemDropPosition } from "./use-item-drag.js";

/** Props for {@link ItemCard}. */
export interface ItemCardProps {
  readonly node: ItemNode;
  readonly selected: boolean;
  readonly menuOpen: boolean;
  readonly canIndent: boolean;
  readonly hasFolders: boolean;
  readonly dragging: boolean;
  /** Drop feedback while this card is the target of an item drag. */
  readonly dropIndicator: ItemDropPosition | null;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly onSelect: () => void;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onStartDrag: (event: PointerEvent<HTMLElement>) => void;
  /** The card's sub-item rows and their "n completed" expander. */
  readonly children?: ReactNode | undefined;
}

/** A vertical insertion edge for before and after drops, or the "Make sub-item" label. */
function CardDropFeedback({ position }: { readonly position: ItemDropPosition | null }) {
  if (position === null) {
    return null;
  }
  if (position === "into") {
    return (
      <span
        aria-hidden="true"
        data-testid="drop-indicator"
        data-placement="into"
        className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-1/2 rounded-full bg-accent px-2.5 py-0.5 text-[11px] leading-4 font-medium text-on-accent shadow-card"
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
        "pointer-events-none absolute inset-y-1.5 z-10 w-1 rounded-full bg-accent",
        position === "before" ? "left-0" : "right-0",
      )}
    />
  );
}

const HEADER_TINTS: Partial<Record<Urgency, string>> = {
  Approaching: "bg-urgency-approaching-soft",
  Imminent: "bg-urgency-overdue-soft",
  Overdue: "bg-urgency-overdue-soft",
};

/** Urgency tints an open card's header (§6.3, §7.17). */
function headerTint(node: ItemNode) {
  return node.item.completedAtUtc === null ? HEADER_TINTS[node.displayedUrgency.value] : undefined;
}

function CardMetadata({
  node,
  lookups,
  date,
}: {
  readonly node: ItemNode;
  readonly lookups: ItemRowLookups;
  readonly date: ItemDate;
}) {
  const typeName = lookups.typeName(node.item.itemTypeId);
  const source = urgencySourceTitle(node, lookups);
  const urgency = node.displayedUrgency.value;
  const DateIcon = date?.icon;
  if (typeName === null && node.item.ticketNumber === null && date === null && urgency === "None") {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-6.5 text-xs text-fg-muted">
      {typeName === null ? null : <ItemTypeIcon name={typeName} />}
      {node.item.ticketNumber === null ? null : (
        <span data-testid="item-ticket" className="tabular-nums">
          {node.item.ticketNumber}
        </span>
      )}
      {date === null ? null : (
        <span data-testid="item-date" className="inline-flex items-center gap-1">
          {DateIcon === undefined ? null : (
            <DateIcon size={12} aria-hidden="true" className="shrink-0 text-fg-subtle" />
          )}
          {date.text}
        </span>
      )}
      <UrgencyBadge urgency={urgency} />
      {source === undefined ? null : <UrgencySource title={source} />}
    </div>
  );
}

function CardTitle({ node }: { readonly node: ItemNode }) {
  const completed = node.item.completedAtUtc !== null;
  return (
    <span
      id={`item-title-${node.item.id}`}
      data-testid="item-title"
      title={node.item.title}
      className={cx(
        "line-clamp-3 min-w-0 flex-1 text-[14px] leading-snug font-medium break-words",
        node.displayedUrgency.value === "Overdue" && !completed && "font-semibold",
        completed && "text-fg-subtle line-through",
      )}
    >
      {node.item.title}
    </span>
  );
}

function CardHeader(props: ItemCardProps & { readonly date: ItemDate; readonly hasBody: boolean }) {
  const { node, lookups, actions, date, hasBody } = props;
  return (
    <div
      data-testid="item-card-header"
      className={cx("px-3 py-2.5", headerTint(node), hasBody && "border-b border-line")}
    >
      <div className="flex items-start gap-1.5">
        <span className="pt-px">
          <CompletionMark
            title={node.item.title}
            completed={node.item.completedAtUtc !== null}
            onToggle={() => void actions.toggleComplete(node)}
          />
        </span>
        <CardTitle node={node} />
        <ItemStatusChip name={statusName(node, lookups)} />
        <ItemOverflowMenu {...props} revealOn="card" />
      </div>
      <CardMetadata node={node} lookups={lookups} date={date} />
    </div>
  );
}

/** True when a pointer or click event started on the card itself rather than a nested row. */
function isOwnEvent(event: MouseEvent<HTMLElement>) {
  return (event.target as Element).closest("[data-item-row-id]") === event.currentTarget;
}

/**
 * A top-level item as a workspace card (§7.17): an urgency-tinted header with the completion
 * button, a title of up to three lines, the status chip and a line with the type, ticket, date
 * and urgency; then a description preview of up to four lines and the item's sub-item rows.
 */
export function ItemCard(props: ItemCardProps) {
  const { node, selected, canIndent, hasFolders, dragging, dropIndicator, lookups, actions } =
    props;
  const date = dateCell(node, lookups.timeZone);
  const description = node.item.description?.trim() ?? "";
  const hasBody = description.length > 0 || props.children !== undefined;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        data-tree-row=""
        data-testid="item-row"
        data-item-card="true"
        data-item-row-id={node.item.id}
        data-dragging={dragging ? "true" : undefined}
        data-drop-into={dropIndicator === "into" ? "true" : undefined}
        onClick={(event) => {
          if (isOwnEvent(event)) {
            props.onSelect();
          }
        }}
        onDoubleClick={(event) => {
          if (isOwnEvent(event)) {
            actions.editItem(node);
          }
        }}
        onPointerDown={props.onStartDrag}
        className={cx(
          "group/card relative flex h-full cursor-default flex-col rounded-card border bg-surface shadow-card transition-colors",
          dropIndicator === "into"
            ? "border-accent bg-accent/15 ring-2 ring-accent/60"
            : selected
              ? "border-accent ring-1 ring-accent"
              : "border-line hover:border-line-strong hover:shadow-card-hover",
          node.isFinished && "text-fg-muted",
          dragging && "opacity-45",
        )}
      >
        <CardDropFeedback position={dropIndicator} />
        <div className={cx("overflow-hidden", hasBody ? "rounded-t-card" : "rounded-card")}>
          <CardHeader {...props} date={date} hasBody={hasBody} />
        </div>
        {hasBody ? (
          <div className="flex flex-1 flex-col gap-1.5 px-2 py-2">
            {description.length === 0 ? null : (
              <p
                data-testid="item-card-description"
                className="line-clamp-4 px-1 text-xs leading-relaxed whitespace-pre-line text-fg-muted"
              >
                {description}
              </p>
            )}
            {props.children}
          </div>
        ) : null}
        <ItemDescription node={node} lookups={lookups} date={date} />
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
