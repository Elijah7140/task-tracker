import type { AreaSnapshot, TicketListEntryProjection } from "@task-tracker/contracts";
import { lookupOptions } from "../editor/editor-options.js";
import { flattenItemNodes, type ItemSiblings } from "../workspace/item-outline.js";
import type { SelectOption } from "../ui/select.js";
import type { AddKind } from "./add-item-draft.js";
import { NO_ENTRY } from "./ticket-list-options.js";

type Snapshot = typeof AreaSnapshot.Type;

/** The lists the add dialog chooses from. */
export interface AddLookups {
  readonly priorityOptions: ReadonlyArray<SelectOption<string>>;
  readonly statusOptions: ReadonlyArray<SelectOption<string>>;
  readonly typeOptions: ReadonlyArray<SelectOption<string>>;
  readonly parentOptions: ReadonlyArray<SelectOption<string>>;
  readonly ticketLists: ReadonlyArray<typeof TicketListEntryProjection.Type>;
}

/** A ticket reads "#385405 · Summary" in pickers; a ToDo by its text. */
function parentLabel(node: ItemSiblings["open"][number]) {
  const { kind, ticketNumber, title } = node.item;
  return kind === "Ticket" && ticketNumber !== null ? `#${ticketNumber} · ${title}` : title;
}

/**
 * Parent choices: the area's open tickets for a new ticket ("Parent ticket"), or every open
 * item for a ToDo. The preset parent, such as the card whose button was used, always stays.
 */
function parentOptions(
  items: ItemSiblings,
  kind: AddKind,
  presetParentId: string | null,
): ReadonlyArray<SelectOption<string>> {
  const candidates = flattenItemNodes(items)
    .map(({ node }) => node)
    .filter((node) => !node.isFinished)
    .filter(
      (node) => kind === "Todo" || node.item.kind === "Ticket" || node.item.id === presetParentId,
    );
  return [
    { value: NO_ENTRY, label: "None" },
    ...candidates.map((node) => ({ value: node.item.id, label: parentLabel(node) })),
  ];
}

/** Builds the dialog's dropdown lists from the area snapshot and the ticket lists. */
export function addLookups(
  snapshot: Snapshot,
  ticketLists: AddLookups["ticketLists"],
  kind: AddKind,
  presetParentId: string | null,
): AddLookups {
  const openStatuses = snapshot.statuses.filter((status) => status.kind === "Open");
  return {
    priorityOptions: lookupOptions(snapshot.priorityLevels, null),
    statusOptions: lookupOptions(openStatuses, null),
    typeOptions: lookupOptions(snapshot.itemTypes, null),
    parentOptions: parentOptions(snapshot.items, kind, presetParentId),
    ticketLists,
  };
}
