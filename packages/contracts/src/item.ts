import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate, IsoFloatingDateTime, IsoTime, IsoUtcInstant } from "./iso-date-time.js";

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
export const ItemEdit = Schema.Struct(itemFields);

/** An item record with floating user dates and UTC system timestamps. */
export const Item = Schema.Struct({
  ...itemFields,
  id: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  parentItemId: Schema.NullOr(Guid),
  sortOrder: Schema.Int,
  createdAtUtc: IsoUtcInstant,
  updatedAtUtc: IsoUtcInstant,
  completedAtUtc: Schema.NullOr(IsoUtcInstant),
  deletedAtUtc: Schema.NullOr(IsoUtcInstant),
  deletionBatchId: Schema.NullOr(Guid),
});
