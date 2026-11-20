import type { ReminderEntry as WireReminderEntry } from "@task-tracker/contracts";
import type { ReminderEntry } from "../db/repositories/reminder-repository.js";
import type { ReminderPanelState } from "../services/reminder-panel.js";

/** Convert a reminder's instant to its ISO form for the panel. */
export function projectReminderEntry(entry: ReminderEntry): typeof WireReminderEntry.Type {
  const { instant, ...fields } = entry;
  return { ...fields, instantUtc: instant.toString() };
}

/** Convert the session panel for the renderer. */
export function projectReminderPanel(state: ReminderPanelState) {
  return { version: state.version, reminders: state.reminders.map(projectReminderEntry) };
}
