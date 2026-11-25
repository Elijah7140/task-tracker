import type { DetailsPanelPosition } from "@task-tracker/contracts";
import {
  ListPlus,
  PanelRightClose,
  PanelRightOpen,
  PanelTopClose,
  PanelTopOpen,
  Pencil,
  Ticket,
  TicketPlus,
} from "lucide-react";
import { useDetailsPanelStore } from "../state/details-panel-store.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { DetailRow, DetailSection } from "./detail-rows.js";
import type { ItemNode } from "./item-outline.js";
import { dateCell, type ItemRowLookups, statusName } from "./item-parts.js";
import { TicketDetails } from "./ticket-details.js";
import type { ItemActions } from "./use-item-actions.js";

/** Props for {@link ItemDetailsPanel}. */
export interface ItemDetailsPanelProps {
  readonly node: ItemNode;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  /** Beside the child cards at the right, or in a band above them (§7.19); the side by default. */
  readonly placement?: typeof DetailsPanelPosition.Type | undefined;
}

type Placement = typeof DetailsPanelPosition.Type;

function KindBadge({ node }: { readonly node: ItemNode }) {
  const ticket = node.item.kind === "Ticket";
  return (
    <span
      data-testid="details-kind"
      className="inline-flex w-fit items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs font-medium text-fg-muted"
    >
      {ticket ? <Ticket size={12} aria-hidden="true" /> : null}
      {ticket ? `Ticket #${node.item.ticketNumber ?? ""}` : "ToDo"}
    </span>
  );
}

/**
 * The item's shared properties as label and value pairs; empty values are left out. A ToDo
 * shows no ticket fields, even a ticket number it already had (§7.19).
 */
function propertyRows(node: ItemNode, lookups: ItemRowLookups) {
  const { item } = node;
  const ticket = item.kind === "Ticket";
  const rows: ReadonlyArray<readonly [string, string | null | undefined]> = [
    ["Status", statusName(node, lookups)],
    ["Priority", lookups.priorityName(item.priorityLevelId)],
    [ticket ? "Est. comp. date" : "Date", dateCell(node, lookups.timeZone)?.text],
  ];
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function Properties({ node, lookups }: Omit<ItemDetailsPanelProps, "actions">) {
  const rows = propertyRows(node, lookups);
  if (rows.length === 0) {
    return null;
  }
  return (
    <DetailSection title="Details" testId="details-properties">
      <dl className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
      </dl>
    </DetailSection>
  );
}

function PanelActions({ node, actions }: Pick<ItemDetailsPanelProps, "node" | "actions">) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => actions.editItem(node)} data-testid="details-edit">
        <Pencil size={13} aria-hidden="true" />
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => actions.addItem("Todo", node.item.id)}
        data-testid="details-add-todo"
      >
        <ListPlus size={13} aria-hidden="true" />
        ToDo
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => actions.addItem("Ticket", node.item.id)}
        data-testid="details-add-ticket"
      >
        <TicketPlus size={13} aria-hidden="true" />
        Ticket
      </Button>
    </div>
  );
}

/** A titled block of the item's longer text, shown only when the text is not blank. */
function TextSection({
  title,
  text,
  testId,
}: {
  readonly title: string;
  readonly text: string | null;
  readonly testId: string;
}) {
  if (text === null || text.trim() === "") {
    return null;
  }
  return (
    <DetailSection title={title} testId={testId}>
      <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg-muted">{text}</p>
    </DetailSection>
  );
}

/** Collapses the details out of the way, or brings them back (§7.19). */
function DetailsToggle({
  placement,
  collapsed,
}: {
  readonly placement: Placement;
  readonly collapsed: boolean;
}) {
  const setCollapsed = useDetailsPanelStore((state) => state.setCollapsed);
  const label = collapsed ? "Expand details" : "Collapse details";
  const Close = placement === "Top" ? PanelTopClose : PanelRightClose;
  const Open = placement === "Top" ? PanelTopOpen : PanelRightOpen;
  const Icon = collapsed ? Open : Close;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      onClick={() => setCollapsed(!collapsed)}
      data-testid="details-panel-toggle"
      className="shrink-0"
    >
      <Icon size={15} aria-hidden="true" />
    </Button>
  );
}

const panelSurface = "rounded-card border border-line bg-surface shadow-card";

/** Collapsed details: a thin strip at the side, or a single header line at the top. */
function CollapsedDetails({
  node,
  placement,
}: {
  readonly node: ItemNode;
  readonly placement: Placement;
}) {
  const { item } = node;
  const top = placement === "Top";
  return (
    <aside
      aria-label={`Details of ${item.title}`}
      data-testid="item-details-panel"
      data-placement={placement}
      data-collapsed="true"
      className={cx(
        panelSurface,
        top
          ? "flex min-w-0 items-center gap-2 px-3 py-1.5"
          : "sticky top-4 flex w-10 flex-col items-center py-1.5",
      )}
    >
      {top ? (
        <>
          <KindBadge node={node} />
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{item.title}</h2>
        </>
      ) : null}
      <DetailsToggle placement={placement} collapsed />
    </aside>
  );
}

/** The item's details below its title: properties, Detail, Notes and a ticket's fields. */
function DetailsBody({ node, lookups }: Omit<ItemDetailsPanelProps, "actions">) {
  const { item } = node;
  return (
    <>
      <Properties node={node} lookups={lookups} />
      <TextSection title="Detail" text={item.description} testId="details-description" />
      <TextSection title="Notes" text={item.notes} testId="details-notes" />
      {item.kind === "Ticket" ? <TicketDetails itemId={item.id} /> : null}
    </>
  );
}

/**
 * The drilled-in item's own data (§7.19): kind, title, details, a ticket's Detail, the notes
 * and, for a ticket, its fixed fields with the parent ticket. At the side it is a panel beside the
 * child cards; at the top it is a band above them whose sections flow across the width.
 * Either collapses with its toggle, a choice remembered on this device.
 */
export function ItemDetailsPanel({
  node,
  lookups,
  actions,
  placement = "Side",
}: ItemDetailsPanelProps) {
  const collapsed = useDetailsPanelStore((state) => state.collapsed);
  if (collapsed) {
    return <CollapsedDetails node={node} placement={placement} />;
  }
  const { item } = node;
  const top = placement === "Top";
  return (
    <aside
      aria-label={`Details of ${item.title}`}
      data-testid="item-details-panel"
      data-placement={placement}
      className={cx(
        panelSurface,
        "flex min-w-0 flex-col gap-5 p-4",
        !top && "sticky top-4 max-h-[calc(100dvh-8rem)] overflow-y-auto",
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <KindBadge node={node} />
          <DetailsToggle placement={placement} collapsed={false} />
        </div>
        <h2 className="text-[15px] leading-snug font-semibold break-words">{item.title}</h2>
        <PanelActions node={node} actions={actions} />
      </div>
      {top ? (
        <div
          data-testid="details-band-sections"
          className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] items-start gap-5"
        >
          <DetailsBody node={node} lookups={lookups} />
        </div>
      ) : (
        <DetailsBody node={node} lookups={lookups} />
      )}
    </aside>
  );
}
