import { Menu } from "@base-ui/react/menu";
import type { PriorityLevelProjection, StatusProjection } from "@task-tracker/contracts";
import { CalendarDays, Circle, CircleCheck, CornerDownRight, Ellipsis, Repeat } from "lucide-react";
import { deadlineLabel, formatInstantDate } from "../format/item-dates.js";
import { describeRepeat } from "../format/recurrence-summary.js";
import { cx } from "../ui/class-names.js";
import { MenuContent } from "../ui/menu.js";
import { Tooltip } from "../ui/tooltip.js";
import { ItemMenuItems } from "./item-menu-items.js";
import type { ItemNode } from "./item-outline.js";
import { useItemSurface } from "./item-surface.js";
import type { ItemActions } from "./use-item-actions.js";

/** Names and zone that item cards and rows resolve their references with. */
export interface ItemRowLookups {
  readonly statuses: readonly (typeof StatusProjection.Type)[];
  readonly priorityName: (priorityId: string | null) => string | null;
  /** All priority levels, including archived ones, for the Set priority submenu. */
  readonly priorityLevels: ReadonlyArray<typeof PriorityLevelProjection.Type>;
  readonly itemTitle: (itemId: string) => string | undefined;
  readonly timeZone: string;
}

/**
 * The completion toggle shared by cards and rows. In the workspace it never takes a Tab stop
 * (§8); a tray card's header circle does (§7.18).
 */
export function CompletionMark({
  title,
  completed,
  onToggle,
  tabbable = false,
}: {
  readonly title: string;
  readonly completed: boolean;
  readonly onToggle: () => void;
  readonly tabbable?: boolean | undefined;
}) {
  const Icon = completed ? CircleCheck : Circle;
  return (
    <button
      type="button"
      tabIndex={tabbable ? undefined : -1}
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

/** The date an item shows: its completion date when finished, otherwise its due date. */
export function dateCell(node: ItemNode, timeZone: string) {
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
  return {
    icon: CalendarDays,
    text: deadline.text,
    spoken: `Due ${deadline.text}`,
  };
}

/** The date icon and text, as returned by {@link dateCell}. */
export type ItemDate = ReturnType<typeof dateCell>;

/** Marks an urgency rolled up from a sub-item, naming that sub-item in a tooltip. */
export function UrgencySource({ title }: { readonly title: string }) {
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

/** The rule summary of a repeating item, such as "Weekly on Fri", or null (§7.11). */
export function repeatSummary(node: ItemNode): string | null {
  const rule = node.item.recurrence ?? null;
  return rule === null ? null : describeRepeat(rule);
}

/** The ↻ marker on a repeating card or row, with the rule as its tooltip (§7.11). */
export function RepeatMarker({ summary }: { readonly summary: string }) {
  const label = `Repeats: ${summary}`;
  return (
    <Tooltip content={summary} testId="repeat-marker-tooltip">
      <span
        role="img"
        aria-label={label}
        data-testid="repeat-marker"
        className="grid size-5 shrink-0 place-items-center rounded-full text-fg-subtle hover:bg-hover"
      >
        <Repeat size={12} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

/** The name of the item's stored status, including an archived one. */
export function statusName(node: ItemNode, lookups: ItemRowLookups): string | undefined {
  return lookups.statuses.find((status) => status.id === node.item.statusId)?.name;
}

/** Speaks the status unless it only repeats the completion state, as the seeded Completed does. */
function spokenStatus(state: string, name: string | undefined): string | null {
  return name === undefined || name.toLowerCase() === state.toLowerCase() ? null : name;
}

/** The title of the sub-item a rolled-up urgency comes from, if any. */
export function urgencySourceTitle(node: ItemNode, lookups: ItemRowLookups) {
  const { value, sourceDescendantId } = node.displayedUrgency;
  return value === "None" || sourceDescendantId === null
    ? undefined
    : lookups.itemTitle(sourceDescendantId);
}

function describeItemNode(node: ItemNode, lookups: ItemRowLookups, date: ItemDate) {
  const urgency = node.displayedUrgency.value;
  const source = urgencySourceTitle(node, lookups);
  const state = node.item.completedAtUtc === null ? "Open" : "Completed";
  return [
    state,
    spokenStatus(state, statusName(node, lookups)),
    node.item.ticketNumber,
    lookups.priorityName(node.item.priorityLevelId),
    date?.spoken ?? date?.text ?? null,
    urgency === "None" ? null : urgency,
    source === undefined ? null : `from sub-item ${source}`,
    node.item.recurrence == null ? null : `repeats ${repeatSummary(node)}`,
  ]
    .filter((part) => part !== null && part !== "")
    .join(", ");
}

/**
 * The hidden description a card's or row's tree item points to with `aria-describedby`:
 * state, status, ticket, priority, date, urgency with its source, and the repeat rule.
 */
export function ItemDescription({
  node,
  lookups,
  date,
}: {
  readonly node: ItemNode;
  readonly lookups: ItemRowLookups;
  readonly date: ItemDate;
}) {
  return (
    <span id={`item-details-${node.item.id}`} className="sr-only">
      {describeItemNode(node, lookups, date)}
    </span>
  );
}

/** Props for {@link ItemOverflowMenu}. */
export interface ItemOverflowMenuProps {
  readonly node: ItemNode;
  readonly menuOpen: boolean;
  readonly canIndent: boolean;
  readonly hasFolders: boolean;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly onMenuOpenChange: (open: boolean) => void;
  /** The hover group that reveals the button: a sub-item row or a whole card. */
  readonly revealOn?: "row" | "card" | undefined;
}

const REVEAL_CLASSES = {
  row: "opacity-0 group-hover/row:opacity-100",
  card: "opacity-0 group-hover/card:opacity-100",
} as const;

/**
 * The ⋯ button that opens the item's actions; it shows on hover and while open. Tray cards
 * have no item menus (§7.18).
 */
export function ItemOverflowMenu({
  node,
  menuOpen,
  canIndent,
  hasFolders,
  lookups,
  actions,
  onMenuOpenChange,
  revealOn = "row",
}: ItemOverflowMenuProps) {
  const surface = useItemSurface();
  if (surface === "tray") {
    return null;
  }
  return (
    <Menu.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
      <Menu.Trigger
        tabIndex={-1}
        aria-label={`Actions for ${node.item.title}`}
        data-testid="item-menu"
        onClick={(event) => event.stopPropagation()}
        className={cx(
          "grid size-6 shrink-0 cursor-default place-items-center justify-self-end rounded-[0.3125rem] text-fg-subtle hover:bg-pressed hover:text-fg data-popup-open:opacity-100",
          REVEAL_CLASSES[revealOn],
        )}
      >
        <Ellipsis size={14} aria-hidden="true" />
      </Menu.Trigger>
      <MenuContent testId="item-menu-popup">
        <ItemMenuItems
          node={node}
          canIndent={canIndent}
          hasFolders={hasFolders}
          priorityLevels={lookups.priorityLevels}
          statuses={lookups.statuses}
          actions={actions}
        />
      </MenuContent>
    </Menu.Root>
  );
}
