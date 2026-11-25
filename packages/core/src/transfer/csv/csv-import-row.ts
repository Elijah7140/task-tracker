import type { FieldValueInput } from "../../fields/field-value-input.js";
import type { ItemKind } from "../../items/item-kind.js";
import type { TicketDetailInput } from "../../tickets/ticket-detail.js";

/** One validated row of an import file, with its lookups resolved to ids. */
export interface CsvImportRow {
  readonly rowNumber: number;
  readonly title: string;
  /** The Description cell: a ticket's Detail, or a ToDo's notes in older files. */
  readonly description: string | null;
  /** The Notes cell: a ticket's notes. */
  readonly notes: string | null;
  readonly ticketNumber: string | null;
  readonly priorityLevelId: string | null;
  readonly statusId: string | null;
  readonly dueDate: Temporal.PlainDate | null;
  readonly dueTime: Temporal.PlainTime | null;
  readonly completedAtUtc: Temporal.Instant | null;
  readonly fieldValues: readonly FieldValueInput[];
  readonly linkUrls: readonly string[];
  /** ToDo unless the Kind column says Ticket (§7.19). */
  readonly kind: ItemKind;
  /** A ticket's fixed fields with list entries resolved; null for a ToDo. */
  readonly ticket: TicketDetailInput | null;
}
