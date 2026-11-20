import { ListPlus, Pencil, Ticket, TicketPlus } from "lucide-react";
import { Button } from "../ui/button.js";
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
}

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

/** The item's shared properties as label and value pairs; empty values are left out. */
function propertyRows(node: ItemNode, lookups: ItemRowLookups) {
  const { item } = node;
  const ticket = item.kind === "Ticket";
  const rows: ReadonlyArray<readonly [string, string | null | undefined]> = [
    ["Ticket #", ticket ? null : item.ticketNumber],
    ["Status", statusName(node, lookups)],
    ["Priority", lookups.priorityName(item.priorityLevelId)],
    ["Type", ticket ? null : lookups.typeName(item.itemTypeId)],
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

/**
 * The drilled-in item's own data beside its children (§7.19): kind, title, details,
 * description and, for a ticket, its fixed fields and comment log.
 */
export function ItemDetailsPanel({ node, lookups, actions }: ItemDetailsPanelProps) {
  const { item } = node;
  return (
    <aside
      aria-label={`Details of ${item.title}`}
      data-testid="item-details-panel"
      className="sticky top-4 flex max-h-[calc(100dvh-8rem)] min-w-0 flex-col gap-5 overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex flex-col gap-2">
        <KindBadge node={node} />
        <h2 className="text-[15px] leading-snug font-semibold break-words">{item.title}</h2>
        <PanelActions node={node} actions={actions} />
      </div>
      <Properties node={node} lookups={lookups} />
      {item.description === null || item.description.trim() === "" ? null : (
        <DetailSection
          title={item.kind === "Ticket" ? "Detail" : "Notes"}
          testId="details-description"
        >
          <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg-muted">
            {item.description}
          </p>
        </DetailSection>
      )}
      {item.kind === "Ticket" ? (
        <TicketDetails itemId={item.id} timeZone={lookups.timeZone} />
      ) : null}
    </aside>
  );
}
