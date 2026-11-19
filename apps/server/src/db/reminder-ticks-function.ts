import { storedReminderBase } from "@task-tracker/core";
import type { SQLOutputValue } from "node:sqlite";
import { Schema } from "effect";
import { UtcTicks } from "./storage-codecs.js";

const encodeTicks = Schema.encodeSync(UtcTicks);

const text = (value: SQLOutputValue) => (typeof value === "string" ? value : "");

/**
 * `tt_reminder_ticks(DueDate, time, ReminderOffsetMinutes, defaultOffset, zone)`:
 * the base reminder instant of a row as .NET UTC ticks, or NULL. SQLite calls it
 * for each eligible row so the due query can order and page by instant (§7.12).
 */
export function reminderTicks(
  dueDate: SQLOutputValue,
  time: SQLOutputValue,
  offsetMinutes: SQLOutputValue,
  defaultOffset: SQLOutputValue,
  timeZone: SQLOutputValue,
): bigint | null {
  if (typeof dueDate !== "string" || typeof timeZone !== "string") {
    return null;
  }
  const minutes =
    typeof offsetMinutes === "number" || typeof offsetMinutes === "bigint"
      ? Number(offsetMinutes)
      : null;
  const instant = storedReminderBase(
    { dueDate, time: text(time), offsetMinutes: minutes, defaultOffset: text(defaultOffset) },
    timeZone,
  );
  return instant === null ? null : encodeTicks(instant);
}
