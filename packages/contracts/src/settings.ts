import { Schema } from "effect";
import { CardColumns } from "./card-columns.js";
import { DurationTicks } from "./duration-ticks.js";
import { Guid } from "./guid.js";
import { EffectiveReminderSettings, ReminderDefaults, ReminderOverrides } from "./reminder.js";

const effectiveValue = <Value extends Schema.Constraint>(value: Value) =>
  Schema.Struct({ value, source: Schema.Literals(["Global", "Project"]) });

/** The global defaults every project inherits unless it overrides them. */
export const GlobalSettings = Schema.Struct({
  autoCompleteParents: Schema.Boolean,
  urgencyYellowThreshold: DurationTicks,
  urgencyRedThreshold: DurationTicks,
  workspaceCardColumns: CardColumns,
  /** Reminder defaults. The server always sends them; a save without them keeps them. */
  reminders: Schema.optionalKey(ReminderDefaults),
  /**
   * Whether closing the window keeps the app running in the tray (§7.12). The
   * server always sends it; a save without it keeps it.
   */
  keepRunningInTray: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether an installed app starts when the user signs in (§7.13). The server
   * always sends it; a save without it keeps it, as where the option is unavailable.
   */
  startWithSystem: Schema.optionalKey(Schema.Boolean),
});

/** Project overrides to save together. Null removes an override so the global value applies. */
export const ProjectSettingOverrides = Schema.Struct({
  autoCompleteParents: Schema.NullOr(Schema.Boolean),
  urgencyYellowThreshold: Schema.NullOr(DurationTicks),
  urgencyRedThreshold: Schema.NullOr(DurationTicks),
  /** Reminder overrides; a save without them keeps the stored ones. */
  reminders: Schema.optionalKey(ReminderOverrides),
});

/** A project's effective settings with the source of each value. */
export const ProjectSettings = Schema.Struct({
  projectId: Guid,
  autoCompleteParents: effectiveValue(Schema.Boolean),
  urgencyYellowThreshold: effectiveValue(DurationTicks),
  urgencyRedThreshold: effectiveValue(DurationTicks),
  /** Effective reminder settings. The server always sends them. */
  reminders: Schema.optionalKey(EffectiveReminderSettings),
});
