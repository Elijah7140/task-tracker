import type { Item } from "@task-tracker/contracts";

type ItemRecord = typeof Item.Type;

/** The due date an item row shows. */
export interface DeadlineLabel {
  readonly kind: "due";
  readonly text: string;
}

/**
 * Floating values (§5.4) mean the same wall-clock reading in any zone, so they
 * are formatted in a fixed UTC frame and never shifted. UTC instants are
 * formatted in the server's zone.
 */
const FLOATING_FRAME = "UTC";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "numeric",
  minute: "2-digit",
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${withTime}`;
  let cached = formatters.get(key);
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat(undefined, {
      ...(withTime ? DATE_TIME_OPTIONS : DATE_OPTIONS),
      timeZone,
    });
    formatters.set(key, cached);
  }
  return cached;
}

const ISO_PARTS = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/;
const TIME_PARTS = /^(\d{2}):(\d{2})/;

/** Epoch milliseconds for the calendar and clock fields of an ISO string, read as UTC. */
function utcMillis(iso: string, time?: string | null): number {
  const [, year, month, day, hour, minute, second] = ISO_PARTS.exec(iso) ?? [];
  const [, timeHour, timeMinute] =
    (time === null || time === undefined ? null : TIME_PARTS.exec(time)) ?? [];
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(timeHour ?? hour ?? 0),
    Number(timeMinute ?? minute ?? 0),
    Number(second ?? 0),
  );
}

/** Formats a floating calendar date such as `2026-11-20`. */
export function formatFloatingDate(date: string): string {
  return formatter(FLOATING_FRAME, false).format(utcMillis(date));
}

/** Formats a floating date with a wall-clock time, such as a due time or a scheduled start. */
export function formatFloatingDateTime(date: string, time?: string | null): string {
  return formatter(FLOATING_FRAME, true).format(utcMillis(date, time));
}

/** Formats the calendar date of a UTC instant as seen in `timeZone`. */
export function formatInstantDate(instant: string, timeZone: string): string {
  return formatter(timeZone, false).format(utcMillis(instant));
}

/**
 * The date a row shows: the due date, with its time when set. Items carry only due
 * dates since 23 Nov 2026, so a stored scheduled start is not shown (§7.4).
 */
export function deadlineLabel(item: ItemRecord): DeadlineLabel | null {
  if (item.dueDate !== null) {
    const text =
      item.dueTime === null
        ? formatFloatingDate(item.dueDate)
        : formatFloatingDateTime(item.dueDate, item.dueTime);
    return { kind: "due", text };
  }
  return null;
}
