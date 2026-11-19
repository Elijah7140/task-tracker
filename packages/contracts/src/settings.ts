import { Schema } from "effect";
import { DurationTicks } from "./duration-ticks.js";
import { Guid } from "./guid.js";

const effectiveValue = <Value extends Schema.Constraint>(value: Value) =>
  Schema.Struct({ value, source: Schema.Literals(["Global", "Project"]) });

/** The global defaults every project inherits unless it overrides them. */
export const GlobalSettings = Schema.Struct({
  autoCompleteParents: Schema.Boolean,
  urgencyYellowThreshold: DurationTicks,
  urgencyRedThreshold: DurationTicks,
});

/** Project overrides to save together. Null removes an override so the global value applies. */
export const ProjectSettingOverrides = Schema.Struct({
  autoCompleteParents: Schema.NullOr(Schema.Boolean),
  urgencyYellowThreshold: Schema.NullOr(DurationTicks),
  urgencyRedThreshold: Schema.NullOr(DurationTicks),
});

/** A project's effective settings with the source of each value. */
export const ProjectSettings = Schema.Struct({
  projectId: Guid,
  autoCompleteParents: effectiveValue(Schema.Boolean),
  urgencyYellowThreshold: effectiveValue(DurationTicks),
  urgencyRedThreshold: effectiveValue(DurationTicks),
});
