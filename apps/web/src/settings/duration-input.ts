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

/** A nonnegative decimal amount such as `3`, `1.5`, `2.` or `.5`. */
const DECIMAL_AMOUNT = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

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
  if (!DECIMAL_AMOUNT.test(trimmed)) {
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

/** Formats `scaled / 10^digits` without trailing fractional zeros. */
function formatScaledAmount(scaled: bigint, digits: number): string {
  const scale = 10n ** BigInt(digits);
  const whole = (scaled / scale).toString();
  const fraction = (scaled % scale).toString().padStart(digits, "0").replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/**
 * Adds or removes one whole unit from a typed amount, keeping its fraction
 * exact and stopping at zero, like the legacy NumericUpDown (Minimum 0,
 * Increment 1). A blank amount counts as zero. Other invalid text is returned
 * unchanged.
 */
export function stepDurationAmount(text: string, step: 1 | -1): string {
  const trimmed = text.trim() === "" ? "0" : text.trim();
  if (!DECIMAL_AMOUNT.test(trimmed)) {
    return text;
  }
  const [wholePart = "", fracPart = ""] = trimmed.split(".");
  const scale = 10n ** BigInt(fracPart.length);
  const current = BigInt(wholePart === "" ? "0" : wholePart) * scale + BigInt(fracPart || "0");
  const next = current + BigInt(step) * scale;
  return next <= 0n ? "0" : formatScaledAmount(next, fracPart.length);
}
