import { Schema } from "effect";
import { DurationTicks } from "./duration-ticks.js";
import { Guid } from "./guid.js";
import { IsoTime, IsoUtcInstant } from "./iso-date-time.js";

/**
 * An item's reminder choice (§7.12): the effective default, none, or an offset in
 * minutes before the due moment. The server accepts only the listed offsets.
 */
export const ReminderChoice = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("default") }),
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({ kind: Schema.Literal("offset"), minutes: Schema.Int }),
]);

/** A delivered reminder in the session's panel, with where its item lives. */
export const ReminderEntry = Schema.Struct({
  itemId: Guid,
  title: Schema.String,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  projectName: Schema.String,
  /** The delivered instant. Snoozing sends it back so a changed reminder is refused. */
  instantUtc: IsoUtcInstant,
});

/** The panel's reminders, newest first, and a version that changes with them. */
export const ReminderPanel = Schema.Struct({
  version: Schema.Int,
  reminders: Schema.Array(ReminderEntry),
});

/** The ways a delivered reminder can be deferred. */
export const ReminderSnooze = Schema.Literals(["tenMinutes", "oneHour", "tomorrow"]);

/** Global reminder defaults (§6.5, §7.12). */
export const ReminderDefaults = Schema.Struct({
  remindersEnabled: Schema.Boolean,
  defaultReminderOffset: DurationTicks,
  dateOnlyReminderTime: IsoTime,
});

/** Reminder overrides to save with a project. Null inherits the global value. */
export const ReminderOverrides = Schema.Struct({
  remindersEnabled: Schema.NullOr(Schema.Boolean),
  defaultReminderOffset: Schema.NullOr(DurationTicks),
  dateOnlyReminderTime: Schema.NullOr(IsoTime),
});

const effectiveValue = <Value extends Schema.Constraint>(value: Value) =>
  Schema.Struct({ value, source: Schema.Literals(["Global", "Project"]) });

/** A project's effective reminder settings with their sources. */
export const EffectiveReminderSettings = Schema.Struct({
  remindersEnabled: effectiveValue(Schema.Boolean),
  defaultReminderOffset: effectiveValue(DurationTicks),
  dateOnlyReminderTime: effectiveValue(IsoTime),
});
