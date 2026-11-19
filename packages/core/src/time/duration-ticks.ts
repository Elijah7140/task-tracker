/** An exact elapsed duration in .NET TimeSpan ticks of 100 nanoseconds each. */
export type DurationTicks = bigint;

/** Conversion factors for fixed-length duration units. */
export const nanosecondsPerTick = 100n;
export const ticksPerSecond = 10_000_000n;
export const ticksPerMinute = 60n * ticksPerSecond;
export const ticksPerHour = 60n * ticksPerMinute;
export const ticksPerDay = 24n * ticksPerHour;
