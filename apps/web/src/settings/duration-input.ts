/** Duration units offered in settings threshold inputs. */
export type DurationUnit = "days" | "hours";

/** Available duration units in select controls. */
export const DURATION_UNITS: ReadonlyArray<{
  readonly value: DurationUnit;
  readonly label: string;
}> = [
  { value: "days", label: "days" },
  { value: "hours", label: "hours" },
];

/** Exact 100-nanosecond ticks per hour. */
export const TICKS_PER_HOUR = 36_000_000_000n;

/** Exact 100-nanosecond ticks per 24-hour day. */
export const TICKS_PER_DAY = 24n * TICKS_PER_HOUR;

/** Maximum nonnegative .NET TimeSpan tick count. */
export const MAX_TIMESPAN_TICKS = (1n << 63n) - 1n;

/**
 * Editable duration field state. `exactTicks` keeps sub-unit values (such as
 * `PT0.5S`) lossless until the user edits the amount or changes the unit.
 */
export interface DurationFieldDraft {
  readonly text: string;
  readonly unit: DurationUnit;
  readonly exactTicks: string | null;
}

function ticksForUnit(unit: DurationUnit): bigint {
  return unit === "days" ? TICKS_PER_DAY : TICKS_PER_HOUR;
}

/** Formats canonical decimal ticks into a clean numeric string in `unit`. */
export function formatDurationAmount(ticksText: string, unit: DurationUnit): string {
  const ticks = BigInt(ticksText);
  const unitTicks = ticksForUnit(unit);
  if (ticks % unitTicks === 0n) {
    return (ticks / unitTicks).toString();
  }
  const value = Number(ticks) / Number(unitTicks);
  return String(Number(value.toFixed(6)));
}

/** Builds an initial draft from canonical server ticks and a preferred display unit. */
export function createDurationDraft(ticksText: string, unit: DurationUnit): DurationFieldDraft {
  return {
    text: formatDurationAmount(ticksText, unit),
    unit,
    exactTicks: ticksText,
  };
}

/**
 * Parses a user-entered nonnegative decimal amount in `unit` into canonical
 * tick strings, or null when the input is invalid or out of TimeSpan range.
 */
export function parseDurationTicks(text: string, unit: DurationUnit): string | null {
  const trimmed = text.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    return null;
  }
  const [wholePart = "", fracPart = ""] = trimmed.split(".");
  const unitTicks = ticksForUnit(unit);
  const wholeTicks = BigInt(wholePart === "" ? "0" : wholePart) * unitTicks;
  const trimmedFrac = fracPart.slice(0, 12);
  let fracTicks = 0n;
  if (trimmedFrac.length > 0) {
    const scale = 10n ** BigInt(trimmedFrac.length);
    fracTicks = (BigInt(trimmedFrac) * unitTicks + scale / 2n) / scale;
  }
  const total = wholeTicks + fracTicks;
  return total <= MAX_TIMESPAN_TICKS ? total.toString() : null;
}

/** Resolves the effective tick string represented by a {@link DurationFieldDraft}. */
export function resolveDurationFieldTicks(draft: DurationFieldDraft): string | null {
  return draft.exactTicks ?? parseDurationTicks(draft.text, draft.unit);
}

/** Validates yellow and red threshold tick strings against §6.3 rules. */
export function validateThresholdTicks(
  yellowTicks: string | null,
  redTicks: string | null,
): string | null {
  if (yellowTicks === null || redTicks === null) {
    return "Thresholds must be nonnegative numbers within range.";
  }
  if (BigInt(redTicks) > BigInt(yellowTicks)) {
    return "Red threshold must be no greater than yellow.";
  }
  return null;
}
