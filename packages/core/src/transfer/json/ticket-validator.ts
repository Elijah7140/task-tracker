import {
  isTicketListKind,
  parentKindOf,
  type TicketListKind,
} from "../../tickets/ticket-list-entry.js";
import type { IssueList } from "../transfer-issue.js";
import type {
  DocumentList,
  ItemDocument,
  TicketDocument,
  TicketListEntryDocument,
} from "./export-document.js";
import { listOf } from "./export-document.js";
import {
  checkId,
  checkName,
  guidText,
  NAME_MAX_LENGTH,
  TICKET_NUMBER_MAX_LENGTH,
  trimText,
} from "./import-checks.js";
import { elementPath } from "./json-path.js";

/** A document's ticket list entries by id: their kind and parent, for reference checks. */
export type TicketEntryKinds = ReadonlyMap<
  string,
  { readonly kind: TicketListKind; readonly parentId: string | null }
>;

const ITEM_KINDS = ["Todo", "Ticket"];

function checkEntryParent(
  entry: TicketListEntryDocument,
  path: string,
  kinds: TicketEntryKinds,
  issues: IssueList,
): void {
  const kind = entry.listKind as TicketListKind;
  const expected = parentKindOf(kind);
  if (expected === null) {
    if (entry.parentId !== null) {
      issues.add(`${path}.parentId`, `A ${kind} entry has no parent.`);
    }
    return;
  }
  if (entry.parentId === null || kinds.get(entry.parentId)?.kind !== expected) {
    issues.add(`${path}.parentId`, `A ${kind} entry needs a parent ${expected} entry.`);
  }
}

/**
 * Checks People, ticket types and levels (§7.19): ids, list kinds, names and that each level
 * sits under the level above it. Returns the kinds by id for the item checks.
 */
export function validateTicketLists(
  list: DocumentList<TicketListEntryDocument>,
  issues: IssueList,
): TicketEntryKinds {
  const entries = listOf(list);
  const kinds = new Map<string, { kind: TicketListKind; parentId: string | null }>();
  for (const entry of entries) {
    if (entry.id !== null && isTicketListKind(entry.listKind) && !kinds.has(entry.id)) {
      kinds.set(entry.id, { kind: entry.listKind, parentId: entry.parentId });
    }
  }
  const seen = new Set<string>();
  entries.forEach((entry, position) => {
    const path = elementPath("$.ticketLists", position);
    checkId(entry.id, `${path}.id`, seen, issues);
    checkName(entry.name, NAME_MAX_LENGTH, `${path}.name`, issues);
    if (!isTicketListKind(entry.listKind)) {
      issues.add(`${path}.listKind`, "Use Person, TicketType, Application, Module or Interface.");
      return;
    }
    checkEntryParent(entry, path, kinds, issues);
  });
  return kinds;
}

const TICKET_REFERENCES: ReadonlyArray<readonly [keyof TicketDocument, TicketListKind]> = [
  ["requestorId", "Person"],
  ["dispatchedToId", "Person"],
  ["pendingPersonId", "Person"],
  ["ticketTypeId", "TicketType"],
  ["applicationId", "Application"],
  ["moduleId", "Module"],
  ["interfaceId", "Interface"],
];

/** A chosen Interface sits under the chosen Module, and a Module under the chosen Application. */
function checkLevelChain(
  ticket: TicketDocument,
  path: string,
  kinds: TicketEntryKinds,
  issues: IssueList,
): void {
  const chain = [
    ["interfaceId", ticket.interfaceId, ticket.moduleId],
    ["moduleId", ticket.moduleId, ticket.applicationId],
  ] as const;
  for (const [property, childId, parentId] of chain) {
    const child = childId === null ? undefined : kinds.get(childId);
    if (child !== undefined && parentId !== null && child.parentId !== parentId) {
      issues.add(`${path}.${property}`, "The level does not belong to the level above it.");
    }
  }
}

function checkTicketFields(
  ticket: TicketDocument,
  path: string,
  kinds: TicketEntryKinds,
  issues: IssueList,
): void {
  for (const [property, kind] of TICKET_REFERENCES) {
    const id = ticket[property] as string | null;
    if (id !== null && kinds.get(id)?.kind !== kind) {
      issues.add(`${path}.${property}`, `${guidText(id)} is not a ${kind} entry in ticketLists.`);
    }
  }
  checkLevelChain(ticket, path, kinds, issues);
  const parent = ticket.parentTicketNumber;
  if (parent !== null && trimText(parent).length > TICKET_NUMBER_MAX_LENGTH) {
    const message = `The parent ticket must be ${TICKET_NUMBER_MAX_LENGTH} characters or fewer.`;
    issues.add(`${path}.parentTicketNumber`, message);
  }
}

/**
 * Checks an item's kind and, for a ticket, its number and fixed fields (§7.19). A ToDo
 * carries no ticket fields. Comments were removed on 25 Nov 2026, so an older file's are
 * ignored.
 */
export function validateItemTicket(
  item: ItemDocument,
  path: string,
  kinds: TicketEntryKinds,
  issues: IssueList,
): void {
  if (item.kind !== null && !ITEM_KINDS.includes(item.kind)) {
    issues.add(`${path}.kind`, "Use Todo or Ticket.");
    return;
  }
  if (item.kind !== "Ticket") {
    if (item.ticket !== null) {
      issues.add(`${path}.kind`, "Only a ticket has ticket fields.");
    }
    return;
  }
  if (item.ticketNumber === null || trimText(item.ticketNumber).length === 0) {
    issues.add(`${path}.ticketNumber`, "A ticket needs a ticket number.");
  }
  if (item.ticket !== null) {
    checkTicketFields(item.ticket, `${path}.ticket`, kinds, issues);
  }
}
