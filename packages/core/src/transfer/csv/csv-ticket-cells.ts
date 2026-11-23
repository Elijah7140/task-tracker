import type { ItemKind } from "../../items/item-kind.js";
import { nameKey } from "../../metadata/names.js";
import { trimText as trim } from "../../text/dotnet-white-space.js";
import type { TicketDetailInput } from "../../tickets/ticket-detail.js";
import type { TicketListEntry, TicketListKind } from "../../tickets/ticket-list-entry.js";
import { TICKET_CSV_COLUMNS as T } from "./csv-columns.js";

/** Reads a fixed column's unprotected cell text. */
type CellText = (column: string) => string;

/** Records a problem in a column of the current row. */
type Fail = (column: string, message: string) => void;

/**
 * Reads the Kind column: blank or ToDo is a ToDo, Ticket is a ticket, ignoring case
 * (§7.19). Anything else records a problem and reads as a ToDo.
 */
export function readCsvKind(text: CellText, fail: Fail): ItemKind {
  const kind = nameKey(trim(text(T.kind)));
  if (kind === "" || kind === "TODO") {
    return "Todo";
  }
  if (kind === "TICKET") {
    return "Ticket";
  }
  fail(T.kind, "Expected ToDo or Ticket.");
  return "Todo";
}

const TICKET_ONLY_COLUMNS = Object.values(T).filter((column) => column !== T.kind);

/** True when a ToDo row has a value in a ticket-only column, which it cannot hold. */
export function hasCsvTicketCells(text: CellText): boolean {
  return TICKET_ONLY_COLUMNS.some((column) => trim(text(column)).length > 0);
}

/** Resolves list entry names, narrowing each level to the one above it when it is set. */
class EntryReader {
  constructor(
    private readonly entries: readonly TicketListEntry[],
    private readonly text: CellText,
    private readonly fail: Fail,
  ) {}

  read(column: string, kind: TicketListKind, parentId?: string | null): string | null {
    const name = trim(this.text(column));
    if (name.length === 0) {
      return null;
    }
    const matches = this.entries.filter(
      (entry) =>
        entry.listKind === kind &&
        nameKey(entry.name) === nameKey(name) &&
        (parentId === undefined || parentId === null || entry.parentId === parentId),
    );
    return this.#single(column, name, matches);
  }

  #single(column: string, name: string, matches: readonly TicketListEntry[]): string | null {
    if (matches.length === 0) {
      this.fail(column, `There is no ${column.toLowerCase()} named '${name}' in the ticket lists.`);
      return null;
    }
    if (matches.length > 1) {
      this.fail(
        column,
        `More than one ${column.toLowerCase()} is named '${name}'. Fill in the level above it.`,
      );
      return null;
    }
    if (matches[0]!.isArchived) {
      this.fail(column, `The ${column.toLowerCase()} '${name}' is archived.`);
    }
    return matches[0]!.id;
  }
}

/** Reads a ticket row's fixed fields, matching people, types and levels by name (§7.19). */
export function readCsvTicket(
  entries: readonly TicketListEntry[],
  text: CellText,
  fail: Fail,
): TicketDetailInput {
  const names = new EntryReader(entries, text, fail);
  const applicationId = names.read(T.application, "Application");
  const moduleId = names.read(T.module, "Module", applicationId);
  return {
    requestorId: names.read(T.requestor, "Person"),
    applicationId,
    moduleId,
    interfaceId: names.read(T.interface, "Interface", moduleId),
    dispatchedToId: names.read(T.dispatchedTo, "Person"),
    pendingPersonId: names.read(T.pendingUser, "Person"),
    ticketTypeId: names.read(T.ticketType, "TicketType"),
  };
}

/** A ticket's fixed fields as CSV cells, in {@link TICKET_CSV_COLUMNS} order after Kind. */
export function writeCsvTicketCells(
  ticket: TicketDetailInput | undefined,
  entryNames: ReadonlyMap<string, string>,
): string[] {
  const name = (id: string | null | undefined) => (id ? (entryNames.get(id) ?? "") : "");
  return [
    name(ticket?.requestorId),
    name(ticket?.applicationId),
    name(ticket?.moduleId),
    name(ticket?.interfaceId),
    name(ticket?.dispatchedToId),
    name(ticket?.pendingPersonId),
    name(ticket?.ticketTypeId),
  ];
}
