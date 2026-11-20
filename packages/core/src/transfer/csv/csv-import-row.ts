import type { FieldValueInput } from "../../fields/field-value-input.js";

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
}
