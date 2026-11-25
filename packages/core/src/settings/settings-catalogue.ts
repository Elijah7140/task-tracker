import { ticksPerDay, ticksPerHour } from "../time/duration-ticks.js";
import { booleanCodec } from "./boolean-codec.js";
import { durationCodec } from "./duration-codec.js";
import { localTimeCodec } from "./local-time-codec.js";
import { optionalHexColorCodec } from "./optional-hex-color-codec.js";
import { reminderOffsetCodec } from "./reminder-offset-codec.js";
import { SettingDefinition } from "./setting-definition.js";
import { trayCardSizeCodec } from "./tray-card-size-codec.js";
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
  /**
   * The `#rrggbb` color of Approaching urgency (§6.3), or null for the theme's yellow.
   * Global only.
   */
  urgencyApproachingColor: new SettingDefinition(
    "urgencyApproachingColor",
    null,
    false,
    optionalHexColorCodec,
  ),
  /**
   * The `#rrggbb` color of Imminent and Overdue urgency (§6.3), or null for the theme's
   * red. Global only.
   */
  urgencyOverdueColor: new SettingDefinition(
    "urgencyOverdueColor",
    null,
    false,
    optionalHexColorCodec,
  ),
  workspaceCardColumns: new SettingDefinition(
    "workspaceCardColumns",
    4,
    false,
    wholeNumberCodec(1, 8),
  ),
  /** Whether Add ToDo opens the detailed add view instead of quick add (§7.19). Global only. */
  todoAddOpensDetails: new SettingDefinition("todoAddOpensDetails", false, false, booleanCodec),
  /** Whether Add Ticket opens the detailed add view instead of quick add (§7.19). Global only. */
  ticketAddOpensDetails: new SettingDefinition("ticketAddOpensDetails", false, false, booleanCodec),
  /**
   * Whether a ToDo completed in the current view leaves the open list at once (§6.2).
   * Off keeps it in place, checked, until the view is left or reloaded. Global only.
   */
  autoHideCompleted: new SettingDefinition("autoHideCompleted", true, false, booleanCodec),
  /** How big the tray card draws its item cards, Full or Compact (§7.18). Global only. */
  trayCardSize: new SettingDefinition("trayCardSize", "Full", false, trayCardSizeCodec),
  /** Whether tray cards show each item's outline and add line (§7.18). Global only. */
  trayCardShowsItems: new SettingDefinition("trayCardShowsItems", true, false, booleanCodec),
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
  /** Whether closing the window hides the app to the tray so reminders keep firing. Global only. */
  keepRunningInTray: new SettingDefinition("keepRunningInTray", false, false, booleanCodec),
  /**
   * Whether an installed app starts when the user signs in (§7.13). Global only and
   * kept out of undo history, because the OS entry is written outside the transaction.
   */
  startWithSystem: new SettingDefinition("startWithSystem", false, false, booleanCodec),
} as const;
