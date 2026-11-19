import type { DurationTicks } from "../time/duration-ticks.js";

/** Nonnegative urgency windows in TimeSpan ticks, with yellow clamped to at least red. */
export class UrgencyThresholds {
  readonly yellow: DurationTicks;

  constructor(
    yellow: DurationTicks,
    readonly red: DurationTicks,
  ) {
    if (yellow < 0n || red < 0n) {
      throw new RangeError("Urgency thresholds cannot be negative.");
    }
    this.yellow = yellow < red ? red : yellow;
  }
}
