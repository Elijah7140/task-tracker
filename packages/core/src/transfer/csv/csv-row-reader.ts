import { validate as validateLink, MAX_LINKS_PER_ITEM } from "../../items/link-policy.js";
import type { LookupEntity } from "../../lookups/lookup-entity.js";
import { firstDoneStatus, type StatusLevel } from "../../lookups/status-level.js";
import { nameKey } from "../../metadata/names.js";
import { trimText as trim } from "../../text/dotnet-white-space.js";
import { NAME_MAX_LENGTH, TICKET_NUMBER_MAX_LENGTH } from "../json/import-checks.js";
import type { IssueList } from "../transfer-issue.js";
import {
  parseTransferDate,
  parseTransferLocal,
  parseTransferTime,
  parseTransferUtc,
} from "../transfer-time-format.js";
import { unprotectCsvCell } from "./csv-cells.js";
import { CSV_COLUMNS as C, TICKET_CSV_COLUMNS } from "./csv-columns.js";

const TICKET_KIND_COLUMN = TICKET_CSV_COLUMNS.kind;
import { readCsvFieldValues } from "./csv-field-values.js";
import type { CsvHeader } from "./csv-header.js";
import type { CsvImportContext } from "./csv-import-context.js";
import type { CsvImportRow } from "./csv-import-row.js";
import type { CsvRecord } from "./csv-parser.js";
import { readCsvPriority } from "./csv-priority-cell.js";
import { splitCsvLinks } from "./csv-link-cell.js";
import { parseCsvYesNo } from "./csv-yes-no.js";
import { hasCsvTicketCells, readCsvKind, readCsvTicket } from "./csv-ticket-cells.js";

type Lookup = Pick<LookupEntity, "id" | "name" | "isArchived">;

const isBlank = (text: string) => trim(text).length === 0;

/**
 * Reads and validates one record of an import file like the legacy `CsvRowReader`.
 * Every problem is added with the row number and column; a record with any
 * problem produces no row.
 */
export class CsvRowReader {
  constructor(
    private readonly header: CsvHeader,
    private readonly context: CsvImportContext,
    private readonly now: Temporal.Instant,
    private readonly record: CsvRecord,
    private readonly issues: IssueList,
  ) {}

  /** The validated row, or null after recording its problems. */
  read(): CsvImportRow | null {
    const problemsBefore = this.issues.count;
    const title = this.#readTitle();
    const ticketNumber = this.#readTicket();
    const itemTypeId = this.#readLookup(C.type, "type", this.context.itemTypes);
    const priorityLevelId = readCsvPriority(this.#textCell.bind(this), this.context, this.#fail);
    const [dueDate, dueTime] = this.#readDue();
    const [scheduledStart, scheduledEnd] = this.#readSchedule();
    const [statusId, completedAtUtc] = this.#readStatusAndCompletion();
    const fieldValues = readCsvFieldValues(this.header, this.context, this.record, this.#fail);
    const linkUrls = this.#readLinks();
    const { kind, ticket } = this.#readKindAndTicket(ticketNumber);
    if (this.issues.count !== problemsBefore) {
      return null;
    }
    const description = this.#readDescription();
    return {
      rowNumber: this.record.rowNumber,
      title,
      description,
      ticketNumber,
      itemTypeId,
      priorityLevelId,
      statusId,
      dueDate,
      dueTime,
      scheduledStart,
      scheduledEnd,
      completedAtUtc,
      fieldValues,
      linkUrls,
      kind,
      ticket,
    };
  }

  /** The Kind column and, for a ticket, its number and fixed fields (§7.19). */
  #readKindAndTicket(ticketNumber: string | null) {
    const text = this.#textCell.bind(this);
    const kind = readCsvKind(text, this.#fail);
    if (kind === "Todo") {
      if (hasCsvTicketCells(text)) {
        this.#fail(TICKET_KIND_COLUMN, "Only a ticket has ticket fields. Set Kind to Ticket.");
      }
      return { kind, ticket: null };
    }
    if (ticketNumber === null) {
      this.#fail(C.ticket, "A ticket needs a ticket number.");
    }
    return { kind, ticket: readCsvTicket(this.context.ticketLists, text, this.#fail) };
  }

  #cell(column: string): string {
    return this.header.cell(this.record, column);
  }

  #textCell(column: string): string {
    return unprotectCsvCell(this.#cell(column));
  }

  readonly #fail = (column: string, message: string) => {
    this.issues.add(`Row ${this.record.rowNumber}, ${column}`, message);
  };

  #readTitle(): string {
    const title = trim(this.#textCell(C.title));
    if (title.length === 0 || title.length > NAME_MAX_LENGTH) {
      this.#fail(C.title, `A title of 1 to ${NAME_MAX_LENGTH} characters is required.`);
    }
    return title;
  }

  #readDescription(): string | null {
    const description = this.#textCell(C.description);
    return isBlank(description) ? null : description;
  }

  #readTicket(): string | null {
    const ticket = trim(this.#textCell(C.ticket));
    if (ticket.length > TICKET_NUMBER_MAX_LENGTH) {
      const limit = TICKET_NUMBER_MAX_LENGTH;
      this.#fail(C.ticket, `The ticket number must be ${limit} characters or fewer.`);
    }
    return ticket.length === 0 ? null : ticket;
  }

  #readLookup(column: string, kind: string, lookups: readonly Lookup[]): string | null {
    const name = trim(this.#textCell(column));
    if (name.length === 0) {
      return null;
    }
    const match = lookups.find((lookup) => nameKey(lookup.name) === nameKey(name));
    if (match === undefined) {
      const valid = lookups.filter((lookup) => !lookup.isArchived).map((lookup) => lookup.name);
      this.#fail(column, `There is no ${kind} named '${name}'. Use one of: ${valid.join(", ")}.`);
      return null;
    }
    if (match.isArchived) {
      this.#fail(column, `The ${kind} '${name}' is archived.`);
    }
    return match.id;
  }

  #readDue(): [Temporal.PlainDate | null, Temporal.PlainTime | null] {
    const date = this.#readValue(
      C.dueDate,
      parseTransferDate,
      "Expected a date such as 2026-11-13.",
    );
    const time = this.#readValue(C.dueTime, parseTransferTime, "Expected a time such as 15:00.");
    if (time !== null && date === null) {
      this.#fail(C.dueTime, "A due time needs a due date.");
    }
    return [date, time];
  }

  #readSchedule(): [Temporal.PlainDateTime | null, Temporal.PlainDateTime | null] {
    const message = "Expected a local date and time such as 2026-11-13T15:00.";
    const start = this.#readValue(C.scheduledStart, parseTransferLocal, message);
    const end = this.#readValue(C.scheduledEnd, parseTransferLocal, message);
    if (end !== null && start === null && isBlank(this.#cell(C.scheduledStart))) {
      this.#fail(C.scheduledEnd, "A scheduled end needs a scheduled start.");
    }
    if (start !== null && end !== null && Temporal.PlainDateTime.compare(end, start) < 0) {
      this.#fail(C.scheduledEnd, "The scheduled end must not be before the start.");
    }
    return [start, end];
  }

  /** Parses a trimmed date or time cell; blank is null and a bad value records `message`. */
  #readValue<T>(column: string, parse: (text: string) => T | null, message: string): T | null {
    const text = trim(this.#cell(column));
    if (text.length === 0) {
      return null;
    }
    const value = parse(text);
    if (value === null) {
      this.#fail(column, message);
    }
    return value;
  }

  /**
   * Reads the Status and completion columns, which must agree (§7.15). A Done
   * status by itself completes the row, and a completed row without a status
   * gets the first Done status.
   */
  #readStatusAndCompletion(): [string | null, Temporal.Instant | null] {
    const statusId = this.#readLookup(C.status, "status", this.context.statuses);
    const status = this.context.statuses.find((row) => row.id === statusId) ?? null;
    const completedAt = this.#readCompletion(status);
    if (statusId === null && completedAt !== null) {
      return [firstDoneStatus(this.context.statuses)?.id ?? null, completedAt];
    }
    return [statusId, completedAt];
  }

  #readCompletion(status: StatusLevel | null): Temporal.Instant | null {
    const completed = this.#readYesNo(C.completed);
    const utcMessage = "Expected a UTC timestamp such as 2026-11-13T12:00:00Z.";
    const completedAt = this.#readValue(C.completedAt, parseTransferUtc, utcMessage);
    if (completed === false && completedAt !== null) {
      this.#fail(C.completedAt, "A completion time is set but Completed says no.");
    }
    const doneButOpen = status?.kind === "Done" && completed === false;
    const openButCompleted =
      status?.kind === "Open" && (completed === true || completedAt !== null);
    if (doneButOpen || openButCompleted) {
      this.#fail(C.status, "Status must agree with completion.");
    }
    const completesNow = completed === true || status?.kind === "Done";
    return completesNow && completedAt === null ? this.now : completedAt;
  }

  #readYesNo(column: string): boolean | null {
    const text = trim(this.#cell(column));
    const value = text.length === 0 ? null : parseCsvYesNo(text);
    if (text.length > 0 && value === null) {
      this.#fail(column, "Expected yes or no.");
    }
    return value;
  }

  /** Reads the Links cell: addresses separated by whitespace, each checked like an editor link. */
  #readLinks(): string[] {
    const urls = splitCsvLinks(this.#cell(C.links));
    if (urls === null) {
      this.#fail(C.links, `An item may have at most ${MAX_LINKS_PER_ITEM} links.`);
      return [];
    }
    for (const url of urls) {
      const problem = validateLink(url, null);
      if (problem !== null && this.header.hasCustomLinksField) {
        this.#fail(
          C.links,
          "The Links column is ambiguous. It expects link addresses. If this column holds values for the custom field, rename the header to 'Links (field)'.",
        );
        break;
      }
      if (problem !== null) {
        this.#fail(C.links, `'${url}': ${problem}`);
      }
    }
    return urls;
  }
}
