import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey, normalizeName } from "../metadata/names.js";
import { orderRows } from "../metadata/order-rows.js";

/**
 * The lists that ticket fields choose from (§7.19). People fill Requestor, Dispatched to
 * and Pending user. Applications, Modules and Interfaces form the ticket levels tree.
 */
export type TicketListKind = "Person" | "TicketType" | "Application" | "Module" | "Interface";

/** Every list kind, in App Settings order. */
export const TICKET_LIST_KINDS: readonly TicketListKind[] = [
  "Person",
  "TicketType",
  "Application",
  "Module",
  "Interface",
];

/** One entry of a ticket list. Levels below Application name their parent entry. */
export interface TicketListEntry {
  readonly id: string;
  readonly listKind: TicketListKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly isArchived: boolean;
  readonly sortOrder: number;
}

const parentKinds: Readonly<Record<TicketListKind, TicketListKind | null>> = {
  Person: null,
  TicketType: null,
  Application: null,
  Module: "Application",
  Interface: "Module",
};

const nouns: Readonly<Record<TicketListKind, string>> = {
  Person: "person",
  TicketType: "ticket type",
  Application: "application",
  Module: "module",
  Interface: "interface",
};

/** The kind an entry's parent must be, or null for a top-level list. */
export function parentKindOf(kind: TicketListKind): TicketListKind | null {
  return parentKinds[kind];
}

/** The lowercase noun for messages and undo labels, such as "ticket type". */
export function ticketListNoun(kind: TicketListKind): string {
  return nouns[kind];
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The noun with its indefinite article, such as "an application". */
export function withArticle(kind: TicketListKind): string {
  const noun = nouns[kind];
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** Narrows stored or received text to a list kind. */
export function isTicketListKind(value: unknown): value is TicketListKind {
  return typeof value === "string" && Object.hasOwn(parentKinds, value);
}

/** Entries that are ordered and named together: the same list and the same parent. */
export function ticketListSiblings(
  rows: readonly TicketListEntry[],
  kind: TicketListKind,
  parentId: string | null,
): TicketListEntry[] {
  return rows
    .filter((row) => row.listKind === kind && row.parentId === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function assertParent(
  kind: TicketListKind,
  parentId: string | null,
  rows: readonly TicketListEntry[],
) {
  const expected = parentKinds[kind];
  if (expected === null) {
    if (parentId !== null) {
      throw new MetadataRuleError(`${capitalize(withArticle(kind))} has no parent entry.`);
    }
    return;
  }
  const parent = rows.find((row) => row.id === parentId);
  if (parent === undefined || parent.listKind !== expected) {
    throw new MetadataRuleError(
      `${capitalize(withArticle(kind))} belongs to ${withArticle(expected)}.`,
    );
  }
}

function assertUniqueName(entry: TicketListEntry, rows: readonly TicketListEntry[]) {
  const key = nameKey(entry.name);
  const duplicate = ticketListSiblings(rows, entry.listKind, entry.parentId).find(
    (other) => other.id !== entry.id && nameKey(other.name) === key,
  );
  if (duplicate === undefined) {
    return;
  }
  const noun = nouns[entry.listKind];
  if (duplicate.isArchived) {
    throw new MetadataRuleError(
      `The name '${entry.name}' is used by an archived ${noun}. Restore it instead.`,
    );
  }
  throw new MetadataRuleError(`The name '${entry.name}' is already used by another ${noun}.`);
}

/** Appends a new entry to its list, below its siblings. */
export function createTicketListEntry(
  id: string,
  kind: TicketListKind,
  parentId: string | null,
  name: string,
  rows: readonly TicketListEntry[],
): TicketListEntry {
  assertParent(kind, parentId, rows);
  const entry: TicketListEntry = {
    id,
    listKind: kind,
    parentId,
    name: normalizeName(name, "Name"),
    isArchived: false,
    sortOrder: ticketListSiblings(rows, kind, parentId).length,
  };
  assertUniqueName(entry, rows);
  return entry;
}

/** Renames an entry after checking its siblings' names, archived ones included. */
export function renameTicketListEntry(
  entry: TicketListEntry,
  name: string,
  rows: readonly TicketListEntry[],
): TicketListEntry {
  const renamed = { ...entry, name: normalizeName(name, "Name") };
  assertUniqueName(renamed, rows);
  return renamed;
}

/** Archives an entry. Tickets keep it, but pickers no longer offer it. */
export function archiveTicketListEntry(entry: TicketListEntry): TicketListEntry {
  return { ...entry, isArchived: true };
}

/** Returns an archived entry to its pickers. */
export function restoreTicketListEntry(entry: TicketListEntry): TicketListEntry {
  return { ...entry, isArchived: false };
}

/** Reorders one list level. `ids` must name every sibling, archived ones included. */
export function reorderTicketListEntries(
  rows: readonly TicketListEntry[],
  kind: TicketListKind,
  parentId: string | null,
  ids: readonly string[],
): TicketListEntry[] {
  const siblings = ticketListSiblings(rows, kind, parentId);
  return orderRows(siblings, ids, "Order must contain every entry of the list exactly once.");
}
