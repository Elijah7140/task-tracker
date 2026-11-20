import type { RecurrenceRule } from "../../items/recurrence/recurrence-rule.js";
import { formatTransferDate } from "../transfer-time-format.js";
import { jsonInteger, jsonObject, jsonString, type JsonOut } from "./json-writer.js";

const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** The camelCase .NET name of a legacy enum value, such as `DueDate` → `dueDate`. */
export function camelEnumName(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Weekday flags as .NET wrote a `[Flags]` enum: `all`, `none` or `monday, thursday`. */
export function formatWeekdays(flags: number): string {
  if (flags === 127) {
    return "all";
  }
  if (flags === 0) {
    return "none";
  }
  return WEEKDAY_NAMES.filter((_name, index) => (flags & (1 << index)) !== 0).join(", ");
}

/** A repeat rule in the legacy record order; null properties are left out. */
export function recurrenceDocument(rule: RecurrenceRule): JsonOut {
  return jsonObject([
    ["frequency", jsonString(camelEnumName(rule.frequency))],
    ["interval", jsonInteger(rule.interval)],
    ["weekdays", rule.weekdays === null ? null : jsonString(formatWeekdays(rule.weekdays))],
    ["monthDay", rule.monthDay === null ? null : jsonInteger(rule.monthDay)],
    ["month", rule.month === null ? null : jsonInteger(rule.month)],
    ["anchor", jsonString(camelEnumName(rule.anchor))],
    ["endKind", jsonString(camelEnumName(rule.endKind))],
    ["endDate", rule.endDate === null ? null : jsonString(formatTransferDate(rule.endDate))],
    ["remaining", rule.remaining === null ? null : jsonInteger(rule.remaining)],
  ]);
}
