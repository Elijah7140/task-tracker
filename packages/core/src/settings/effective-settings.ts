import type { DurationTicks } from "../time/duration-ticks.js";

/** A resolved value with its source. Defaults have the global source. */
export interface EffectiveValue<T> {
  readonly value: T;
  readonly source: "Global" | "Project";
}

/** The resolved project settings and their individual sources. */
export interface EffectiveSettings {
  readonly autoCompleteParents: EffectiveValue<boolean>;
  readonly urgencyYellowThreshold: EffectiveValue<DurationTicks>;
  readonly urgencyRedThreshold: EffectiveValue<DurationTicks>;
  readonly workspaceCardColumns: EffectiveValue<number>;
}
