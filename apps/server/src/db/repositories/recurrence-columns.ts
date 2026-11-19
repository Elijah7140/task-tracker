import {
  RECURRENCE_ANCHORS,
  RECURRENCE_END_KINDS,
  RECURRENCE_FREQUENCIES,
  type RecurrenceRule,
  type TodoItem,
} from "@task-tracker/core";
import { Schema } from "effect";
import { Bit, DateText, Guid } from "../storage-codecs.js";

/** The recurrence columns of TodoItem, with legacy enum numbers (§7.11). */
export const recurrenceColumnFields = {
  recurrenceFrequency: Schema.NullOr(Schema.Int),
  recurrenceInterval: Schema.NullOr(Schema.Int),
  recurrenceWeekdays: Schema.NullOr(Schema.Int),
  recurrenceMonthDay: Schema.NullOr(Schema.Int),
  recurrenceMonth: Schema.NullOr(Schema.Int),
  recurrenceAnchor: Schema.NullOr(Schema.Int),
  recurrenceEndKind: Schema.NullOr(Schema.Int),
  recurrenceEndDate: Schema.NullOr(DateText),
  recurrenceRemaining: Schema.NullOr(Schema.Int),
  recurrenceSeriesId: Schema.NullOr(Guid),
  recurrenceSuccessorCreated: Bit,
};

/** EF column names for {@link recurrenceColumnFields}. */
export const recurrenceColumnNames = {
  recurrenceFrequency: "RecurrenceFrequency",
  recurrenceInterval: "RecurrenceInterval",
  recurrenceWeekdays: "RecurrenceWeekdays",
  recurrenceMonthDay: "RecurrenceMonthDay",
  recurrenceMonth: "RecurrenceMonth",
  recurrenceAnchor: "RecurrenceAnchor",
  recurrenceEndKind: "RecurrenceEndKind",
  recurrenceEndDate: "RecurrenceEndDate",
  recurrenceRemaining: "RecurrenceRemaining",
  recurrenceSeriesId: "RecurrenceSeriesId",
  recurrenceSuccessorCreated: "RecurrenceSuccessorCreated",
} as const;

/** Decoded column values before they are joined into a rule. */
export type RecurrenceColumns = Schema.Struct<typeof recurrenceColumnFields>["Type"];

type StoredRecurrence = Pick<
  TodoItem,
  "recurrence" | "recurrenceSeriesId" | "recurrenceSuccessorCreated"
>;

/** Legacy enums start at 1 in declaration order. */
function enumName<Name extends string>(names: readonly Name[], value: number | null): Name {
  const name = value === null ? undefined : names[value - 1];
  if (name === undefined) {
    throw new Error(`Unknown stored recurrence value ${value}.`);
  }
  return name;
}

function enumNumber<Name extends string>(names: readonly Name[], name: Name): number {
  return names.indexOf(name) + 1;
}

/** Joins stored columns into the domain rule. A null frequency means no rule. */
export function readRecurrence(columns: RecurrenceColumns): StoredRecurrence {
  const { recurrenceSeriesId, recurrenceSuccessorCreated } = columns;
  if (columns.recurrenceFrequency === null) {
    return { recurrence: null, recurrenceSeriesId, recurrenceSuccessorCreated };
  }
  const recurrence: RecurrenceRule = {
    frequency: enumName(RECURRENCE_FREQUENCIES, columns.recurrenceFrequency),
    interval: columns.recurrenceInterval ?? 1,
    weekdays: columns.recurrenceWeekdays,
    monthDay: columns.recurrenceMonthDay,
    month: columns.recurrenceMonth,
    anchor: enumName(RECURRENCE_ANCHORS, columns.recurrenceAnchor),
    endKind: enumName(RECURRENCE_END_KINDS, columns.recurrenceEndKind),
    endDate: columns.recurrenceEndDate,
    remaining: columns.recurrenceRemaining,
  };
  return { recurrence, recurrenceSeriesId, recurrenceSuccessorCreated };
}

/** Splits the domain rule into its stored columns. */
export function writeRecurrence(item: StoredRecurrence): RecurrenceColumns {
  const rule = item.recurrence;
  return {
    recurrenceFrequency: rule === null ? null : enumNumber(RECURRENCE_FREQUENCIES, rule.frequency),
    recurrenceInterval: rule?.interval ?? null,
    recurrenceWeekdays: rule?.weekdays ?? null,
    recurrenceMonthDay: rule?.monthDay ?? null,
    recurrenceMonth: rule?.month ?? null,
    recurrenceAnchor: rule === null ? null : enumNumber(RECURRENCE_ANCHORS, rule.anchor),
    recurrenceEndKind: rule === null ? null : enumNumber(RECURRENCE_END_KINDS, rule.endKind),
    recurrenceEndDate: rule?.endDate ?? null,
    recurrenceRemaining: rule?.remaining ?? null,
    recurrenceSeriesId: item.recurrenceSeriesId,
    recurrenceSuccessorCreated: item.recurrenceSuccessorCreated,
  };
}
