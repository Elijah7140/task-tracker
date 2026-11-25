import type { AreaSnapshot, TicketListEntryProjection } from "@task-tracker/contracts";
import { lookupOptions } from "../editor/editor-options.js";
import { findItemNode, flattenItemNodes, type ItemSiblings } from "../workspace/item-outline.js";
import type { SelectOption } from "../ui/select.js";
import { NO_ENTRY } from "./ticket-list-options.js";

type Snapshot = typeof AreaSnapshot.Type;

/** The lists the add dialog chooses from. */
export interface AddLookups {
  readonly priorityOptions: ReadonlyArray<SelectOption<string>>;
  readonly statusOptions: ReadonlyArray<SelectOption<string>>;
  readonly parentOptions: ReadonlyArray<SelectOption<string>>;
  readonly ticketLists: ReadonlyArray<typeof TicketListEntryProjection.Type>;
}

/** A ticket reads "#385405 · Summary" in pickers; a ToDo by its text. */
function parentLabel(node: ItemSiblings["open"][number]) {
  const { kind, ticketNumber, title } = node.item;
  return kind === "Ticket" && ticketNumber !== null ? `#${ticketNumber} · ${title}` : title;
}

/**
 * The ToDo's Parent choices: every open item. A ticket's parent ticket is typed as a number
 * instead (§7.19), so this list places only ToDos.
 */
function parentOptions(items: ItemSiblings): ReadonlyArray<SelectOption<string>> {
  const candidates = flattenItemNodes(items)
    .map(({ node }) => node)
    .filter((node) => !node.isFinished);
  return [
    { value: NO_ENTRY, label: "None" },
    ...candidates.map((node) => ({ value: node.item.id, label: parentLabel(node) })),
  ];
}

/** Builds the dialog's dropdown lists from the area snapshot and the ticket lists. */
export function addLookups(snapshot: Snapshot, ticketLists: AddLookups["ticketLists"]): AddLookups {
  const openStatuses = snapshot.statuses.filter((status) => status.kind === "Open");
  return {
    priorityOptions: lookupOptions(snapshot.priorityLevels, null),
    statusOptions: lookupOptions(openStatuses, null),
    parentOptions: parentOptions(snapshot.items),
    ticketLists,
  };
}

/**
 * The parent ticket number a new ticket starts with: the number of the ticket it is added
 * under, or null under a ToDo or at the top of the level.
 */
export function presetParentTicketNumber(
  snapshot: Snapshot,
  parentItemId: string | null,
): string | null {
  const parent = parentItemId === null ? undefined : findItemNode(snapshot.items, parentItemId);
  return parent?.item.kind === "Ticket" ? parent.item.ticketNumber : null;
}
