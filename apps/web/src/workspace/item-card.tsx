import { type AddLinePosition, isBlankText } from "@task-tracker/contracts";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Ticket } from "lucide-react";
import { type MouseEvent, type PointerEvent, type ReactNode, useState } from "react";
import { CardAddButton } from "./card-add-buttons.js";
import { CardDetail } from "./card-detail.js";
import { CardNotes } from "./card-notes.js";
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
import { type ItemSurface, useItemSurface } from "./item-surface.js";
import { type Urgency, UrgencyBadge } from "./urgency-badge.js";
import type { ItemActions } from "./use-item-actions.js";
import type { ItemDropPosition } from "./use-item-drag.js";
import { OutlineAddInput } from "./outline-add-input.js";

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
  /** Whether the "Add a ToDo…" line sits above or below the outline (§7.17); above by default. */
  readonly addLinePosition?: typeof AddLinePosition.Type | undefined;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly onSelect: () => void;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onStartDrag: (event: PointerEvent<HTMLElement>) => void;
  /** Ends an open card with the "Add a ToDo…" line; tray cards can hide it (§7.18). */
  readonly addLine?: boolean | undefined;
  /** The card's sub-item outline: every descendant, nested, with "n completed" expanders. */
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
  const source = urgencySourceTitle(node, lookups);
  const urgency = node.displayedUrgency.value;
  const DateIcon = date?.icon;
  const repeat = repeatSummary(node);
  const empty = node.item.ticketNumber === null && date === null;
  if (empty && urgency === "None" && repeat === null) {
    return null;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-6.5 text-xs text-fg-muted">
      {node.item.ticketNumber === null ? null : (
        <span data-testid="item-ticket" className="inline-flex items-center gap-1 tabular-nums">
          {node.item.kind === "Ticket" ? (
            <Ticket size={12} aria-label="Ticket" className="shrink-0 text-fg-subtle" />
          ) : null}
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
      {repeat === null ? null : <RepeatMarker summary={repeat} />}
    </div>
  );
}

function CardTitle({ node }: { readonly node: ItemNode }) {
  const completed = node.item.completedAtUtc !== null;
  return (
    <span
      id={`item-title-${node.item.id}`}
      data-testid="item-title"
      className={cx(
        "min-w-0 flex-1 text-[14px] leading-snug font-medium [overflow-wrap:anywhere]",
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
  const surface = useItemSurface();
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
            tabbable={surface === "tray"}
          />
        </span>
        <CardTitle node={node} />
        <ItemStatusChip name={statusName(node, lookups)} wrap />
        <CardActions {...props} />
      </div>
      <CardMetadata node={node} lookups={lookups} date={date} />
    </div>
  );
}

/**
 * The card's 2×2 action group (§7.19): ⋯ at the top right, Add ToDo and Add Ticket below,
 * which add a child of this card's item. The empty top-left cell keeps the group's shape.
 * Tray cards have none (§7.18).
 */
function CardActions(props: ItemCardProps) {
  const { node, actions } = props;
  const surface = useItemSurface();
  if (surface === "tray") {
    return null;
  }
  const add = (kind: "Todo" | "Ticket") => actions.addItem(kind, node.item.id);
  return (
    <div
      data-testid="item-card-actions"
      className="-my-0.5 -mr-1 grid shrink-0 grid-cols-2 gap-0.5"
    >
      <span aria-hidden="true" className="size-6" />
      <ItemOverflowMenu {...props} revealOn="card" />
      <CardAddButton kind="Todo" title={node.item.title} onAdd={add} />
      <CardAddButton kind="Ticket" title={node.item.title} onAdd={add} />
    </div>
  );
}

/**
 * Whether the card shows its ticket's Detail: in the workspace by the ticket's choice or the
 * setting (§7.17), and always on an in-progress card (§7.18), where it is clamped. Only when
 * there is text.
 */
function showsDetail(node: ItemNode, surface: ItemSurface) {
  const chosen = surface === "tray" || node.showsDetailOnCard;
  return chosen && !isBlankText(node.item.description ?? "");
}

/** True when a pointer or click event started on the card itself rather than a nested row. */
function isOwnEvent(event: MouseEvent<HTMLElement>) {
  return (event.target as Element).closest("[data-item-row-id]") === event.currentTarget;
}

/**
 * The always-present add line of an open card, above or below its outline (§7.17).
 * Enter adds a ToDo as the card's last direct child; Shift+Enter adds it under the card's last
 * open child instead. The line stays in place and keeps focus, so typing continues.
 */
function CardAddLine({ node, actions }: Pick<ItemCardProps, "node" | "actions">) {
  const [value, setValue] = useState("");
  const submit = async (title: string, asChild: boolean) => {
    const parentId = (asChild ? node.children.open.at(-1) : undefined)?.item.id ?? node.item.id;
    const created = await actions.addOutlineItem(parentId, title);
    if (created !== null) {
      setValue((current) => (current === title ? "" : current));
    }
    return created !== null;
  };
  return (
    <OutlineAddInput
      value={value}
      onValueChange={setValue}
      onSubmit={submit}
      onEscape={(input) => input.blur()}
      label={`Add a ToDo to ${node.item.title}`}
      placeholder="Add a ToDo…"
      testId="card-add-input"
    />
  );
}

/**
 * A top-level item as a workspace card (§7.17): an urgency-tinted header with the completion
 * button, the full title, the status chip and a line with the ticket, date and urgency. The
 * body reads like a dotted list: a ticket's Detail when the card shows it, the Markdown notes
 * and every descendant nested under its parent, with an add line above or below the outline.
 * No text is cut off; the card grows to fit.
 */
export function ItemCard(props: ItemCardProps) {
  const { node, selected, canIndent, hasFolders, dragging, dropIndicator, lookups, actions } =
    props;
  const date = dateCell(node, lookups.timeZone);
  const hasNotes = !isBlankText(node.item.notes ?? "");
  const open = !node.isFinished;
  const surface = useItemSurface();
  const detail = showsDetail(node, surface);
  const hasBody = detail || hasNotes || open || props.children !== undefined;
  const addLine =
    open && props.addLine !== false ? <CardAddLine node={node} actions={actions} /> : null;
  const addLineAtTop = (props.addLinePosition ?? "Top") === "Top";
  return (
    <ContextMenu.Root disabled={surface === "tray"}>
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
            actions.openItem(node);
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
          <div className="flex flex-1 flex-col gap-1 px-2 py-2">
            {detail ? <CardDetail node={node} /> : null}
            {hasNotes || open ? (
              <CardNotes
                title={node.item.title}
                notes={node.item.notes}
                revealAdd={selected || surface === "tray"}
                onSave={(notes) => actions.saveNotes(node, notes)}
              />
            ) : null}
            {addLineAtTop ? addLine : null}
            {props.children}
            {addLineAtTop ? null : addLine}
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
