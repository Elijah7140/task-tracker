import type { FieldValueInput } from "../../fields/field-value-input.js";
import type { ItemKind } from "../../items/item-kind.js";
import type { TicketDetailInput } from "../../tickets/ticket-detail.js";

/** One validated row of an import file, with its lookups resolved to ids. */
export interface CsvImportRow {
  readonly rowNumber: number;
  readonly title: string;
  readonly description: string | null;
  readonly ticketNumber: string | null;
  readonly itemTypeId: string | null;
  readonly priorityLevelId: string | null;
  readonly statusId: string | null;
  readonly dueDate: Temporal.PlainDate | null;
  readonly dueTime: Temporal.PlainTime | null;
  readonly scheduledStart: Temporal.PlainDateTime | null;
  readonly scheduledEnd: Temporal.PlainDateTime | null;
  readonly completedAtUtc: Temporal.Instant | null;
  readonly fieldValues: readonly FieldValueInput[];
  readonly linkUrls: readonly string[];
  /** ToDo unless the Kind column says Ticket (§7.19). */
  readonly kind: ItemKind;
  /** A ticket's fixed fields with list entries resolved; null for a ToDo. */
  readonly ticket: TicketDetailInput | null;
}
