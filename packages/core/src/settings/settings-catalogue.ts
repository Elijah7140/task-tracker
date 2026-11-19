import { ticksPerDay, ticksPerHour } from "../time/duration-ticks.js";
import { booleanCodec } from "./boolean-codec.js";
import { durationCodec } from "./duration-codec.js";
import { localTimeCodec } from "./local-time-codec.js";
import { reminderOffsetCodec } from "./reminder-offset-codec.js";
import { SettingDefinition } from "./setting-definition.js";
import { wholeNumberCodec } from "./whole-number-codec.js";

/** The typed definitions of the built-in global settings and project overrides. */
export const SettingsCatalogue = {
  autoCompleteParents: new SettingDefinition("autoCompleteParents", true, true, booleanCodec),
  urgencyYellowThreshold: new SettingDefinition(
    "urgencyYellowThreshold",
    3n * ticksPerDay,
    true,
    durationCodec,
  ),
  urgencyRedThreshold: new SettingDefinition(
    "urgencyRedThreshold",
    ticksPerDay,
    true,
    durationCodec,
  ),
  workspaceCardColumns: new SettingDefinition(
    "workspaceCardColumns",
    4,
    false,
    wholeNumberCodec(1, 8),
  ),
  /** Whether open dated items remind (§7.12). */
  remindersEnabled: new SettingDefinition("remindersEnabled", true, true, booleanCodec),
  /** How long before the due moment an item on the Default choice reminds. */
  defaultReminderOffset: new SettingDefinition(
    "defaultReminderOffset",
    ticksPerHour,
    true,
    reminderOffsetCodec,
  ),
  /** The local time that stands in for the due moment of a date-only item. */
  dateOnlyReminderTime: new SettingDefinition(
    "dateOnlyReminderTime",
    Temporal.PlainTime.from("09:00"),
    true,
    localTimeCodec,
  ),
} as const;
