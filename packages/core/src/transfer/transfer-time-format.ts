import { trimText } from "../text/dotnet-white-space.js";

/**
 * Writes and reads dates and times in the invariant ISO forms of both transfer
 * formats (§7.9), exactly as the legacy `TransferTimeFormat` did. Floating local
 * values carry no offset and UTC timestamps end with `Z`. Fractions have at most
 * seven digits (.NET ticks) and are written without trailing zeros.
 */

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** The `.FFFFFFF` fraction of a time: empty when zero, otherwise without trailing zeros. */
function fraction(time: { millisecond: number; microsecond: number; nanosecond: number }): string {
  const ticks = Math.floor(
    (time.millisecond * 1_000_000 + time.microsecond * 1000 + time.nanosecond) / 100,
  );
  return ticks === 0 ? "" : `.${pad(ticks, 7).replace(/0+$/, "")}`;
}

/** Formats a date as `yyyy-MM-dd`. */
export function formatTransferDate(date: Temporal.PlainDate): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** Formats a time of day as `HH:mm:ss`, with a fraction only when there is one. */
export function formatTransferTime(time: Temporal.PlainTime): string {
  return `${pad(time.hour, 2)}:${pad(time.minute, 2)}:${pad(time.second, 2)}${fraction(time)}`;
}

/** Formats a floating local date and time without any offset. */
function formatTransferLocal(value: Temporal.PlainDateTime): string {
  return `${formatTransferDate(value.toPlainDate())}T${formatTransferTime(value.toPlainTime())}`;
}

/** Formats a UTC instant with a trailing `Z`. */
export function formatTransferUtc(value: Temporal.Instant): string {
  return `${formatTransferLocal(value.toZonedDateTimeISO("UTC").toPlainDateTime())}Z`;
}

const datePattern = String.raw`(\d{4})-(\d{2})-(\d{2})`;
const timePattern = String.raw`(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{0,7}))?)?`;
const dateOnly = new RegExp(`^${datePattern}$`);
const timeOnly = new RegExp(`^${timePattern}$`);
const utc = new RegExp(String.raw`^${datePattern}T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{0,7}))?Z$`);

function toDate(year: string, month: string, day: string): Temporal.PlainDate | null {
  try {
    const value = { year: Number(year), month: Number(month), day: Number(day) };
    return value.year < 1 ? null : Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    return null;
  }
}

function toTime(
  hour: string,
  minute: string,
  second = "0",
  digits = "",
): Temporal.PlainTime | null {
  const nanoseconds = Number(digits.padEnd(9, "0"));
  try {
    return Temporal.PlainTime.from(
      {
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
        millisecond: Math.floor(nanoseconds / 1_000_000),
        microsecond: Math.floor(nanoseconds / 1000) % 1000,
        nanosecond: nanoseconds % 1000,
      },
      { overflow: "reject" },
    );
  } catch {
    return null;
  }
}

/** Reads `yyyy-MM-dd`, or null. Surrounding whitespace is ignored. */
export function parseTransferDate(text: string | null | undefined): Temporal.PlainDate | null {
  const match = dateOnly.exec(trimText(text ?? ""));
  return match ? toDate(match[1]!, match[2]!, match[3]!) : null;
}

/** Reads `HH:mm`, `HH:mm:ss` or `HH:mm:ss.FFFFFFF`, or null. */
export function parseTransferTime(text: string | null | undefined): Temporal.PlainTime | null {
  const match = timeOnly.exec(trimText(text ?? ""));
  return match ? toTime(match[1]!, match[2]!, match[3], match[4]) : null;
}

/** Reads a UTC timestamp that ends with `Z` and has seconds, or null. */
export function parseTransferUtc(text: string | null | undefined): Temporal.Instant | null {
  const match = utc.exec(trimText(text ?? ""));
  const date = match ? toDate(match[1]!, match[2]!, match[3]!) : null;
  const time = match ? toTime(match[4]!, match[5]!, match[6], match[7]) : null;
  return date && time
    ? date.toZonedDateTime({ timeZone: "UTC", plainTime: time }).toInstant()
    : null;
}
