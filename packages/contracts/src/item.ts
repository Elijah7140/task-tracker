import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate, IsoFloatingDateTime, IsoTime, IsoUtcInstant } from "./iso-date-time.js";
import { RecurrenceRule } from "./recurrence-rule.js";
import { ReminderChoice } from "./reminder.js";
import { ItemKind } from "./ticket-fields.js";

// The EF-compatible SQLite storage retains a precision of 100 nanoseconds.
const tickPrecision = Schema.makeFilter((value: string) => !/\.\d{7}\d*[1-9]/.test(value), {
  expected: "a time representable in 100-nanosecond ticks",
});

const itemFields = {
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  ticketNumber: Schema.NullOr(Schema.String),
  itemTypeId: Schema.NullOr(Guid),
  priorityLevelId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime.check(tickPrecision)),
  scheduledStart: Schema.NullOr(IsoFloatingDateTime.check(tickPrecision)),
  scheduledEnd: Schema.NullOr(IsoFloatingDateTime.check(tickPrecision)),
};

/** Replacement values for an item's built-in fields. */
export const ItemEdit = Schema.Struct({
  ...itemFields,
  statusId: Schema.optionalKey(Schema.NullOr(Guid)),
});

/** An item record with floating user dates and UTC system timestamps. */
export const Item = Schema.Struct({
  ...itemFields,
  id: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  parentItemId: Schema.NullOr(Guid),
  /** ToDo or Ticket (§7.19). The server always sends it; absent means ToDo. */
  kind: Schema.optionalKey(ItemKind),
  sortOrder: Schema.Int,
  createdAtUtc: IsoUtcInstant,
  updatedAtUtc: IsoUtcInstant,
  statusId: Schema.NullOr(Guid),
  reopenStatusId: Schema.NullOr(Guid),
  completedAtUtc: Schema.NullOr(IsoUtcInstant),
  /** The repeat rule (§7.11). The server always sends it; an absent key means no rule. */
  recurrence: Schema.optionalKey(Schema.NullOr(RecurrenceRule)),
  /** Shared by the occurrences of one series; absent or null without a rule. */
  recurrenceSeriesId: Schema.optionalKey(Schema.NullOr(Guid)),
  /** The reminder choice (§7.12). The server always sends it; absent means Default. */
  reminder: Schema.optionalKey(ReminderChoice),
  deletedAtUtc: Schema.NullOr(IsoUtcInstant),
  deletionBatchId: Schema.NullOr(Guid),
});
