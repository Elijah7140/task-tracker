import {
  isTicketListKind,
  parentKindOf,
  type TicketListKind,
} from "../../tickets/ticket-list-entry.js";
import type { IssueList } from "../transfer-issue.js";
import type {
  CommentDocument,
  DocumentList,
  ItemDocument,
  TicketDocument,
  TicketListEntryDocument,
} from "./export-document.js";
import { listOf } from "./export-document.js";
import { checkId, checkName, guidText, NAME_MAX_LENGTH, trimText } from "./import-checks.js";
import { elementPath } from "./json-path.js";
import { checkTimestamp } from "./timestamp-checks.js";

/** A document's ticket list entries by id: their kind and parent, for reference checks. */
export type TicketEntryKinds = ReadonlyMap<
  string,
  { readonly kind: TicketListKind; readonly parentId: string | null }
>;

const ITEM_KINDS = ["Todo", "Ticket"];

/** The longest comment the app accepts (§7.19). */
const COMMENT_MAX_LENGTH = 20_000;

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
  const hours = ticket.estimatedHours;
  if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 100_000)) {
    issues.add(`${path}.estimatedHours`, "Estimated hours must be from 0 to 100000.");
  }
  const percent = ticket.percentComplete;
  if (percent !== null && (percent < 0 || percent > 100)) {
    issues.add(`${path}.percentComplete`, "Percent complete must be from 0 to 100.");
  }
  if (ticket.version !== null && trimText(ticket.version).length > 100) {
    issues.add(`${path}.version`, "The value must be 100 characters or fewer.");
  }
}

function checkComments(comments: readonly CommentDocument[], path: string, issues: IssueList) {
  comments.forEach((comment, position) => {
    const commentPath = elementPath(path, position);
    checkName(comment.body, COMMENT_MAX_LENGTH, `${commentPath}.body`, issues);
    checkTimestamp(comment.createdAtUtc, `${commentPath}.createdAtUtc`, issues);
  });
}

/**
 * Checks an item's kind and, for a ticket, its number, fixed fields and comments (§7.19).
 * A ToDo may carry neither ticket fields nor comments.
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
  const comments = listOf(item.comments);
  if (item.kind !== "Ticket") {
    if (item.ticket !== null || comments.length > 0) {
      issues.add(`${path}.kind`, "Only a ticket has ticket fields and comments.");
    }
    return;
  }
  if (item.ticketNumber === null || trimText(item.ticketNumber).length === 0) {
    issues.add(`${path}.ticketNumber`, "A ticket needs a ticket number.");
  }
  if (item.ticket !== null) {
    checkTicketFields(item.ticket, `${path}.ticket`, kinds, issues);
  }
  checkComments(comments, `${path}.comments`, issues);
}
