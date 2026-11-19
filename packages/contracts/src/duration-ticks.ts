import { Schema } from "effect";

const maxTimeSpanTicks = 2n ** 63n - 1n;

/**
 * A nonnegative .NET TimeSpan as a decimal count of 100-nanosecond ticks.
 *
 * Settings store durations as XmlConvert text (`P3D`), but several texts name the same
 * duration (`P1D`, `PT24H`). The wire carries the canonical tick count instead: it is
 * exact beyond `Number.MAX_SAFE_INTEGER`, compares and converts with `BigInt` without
 * an ISO 8601 parser in the renderer, and matches the area snapshot's thresholds. The
 * server converts to and from XmlConvert text with the Core codec.
 */
export const DurationTicks = Schema.String.check(
  Schema.isPattern(/^\d{1,19}$/),
  Schema.makeFilter((text: string) => BigInt(text) <= maxTimeSpanTicks, {
    expected: "a duration within the .NET TimeSpan range",
  }),
);
