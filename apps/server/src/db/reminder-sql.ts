import { SettingsCatalogue, type SettingDefinition } from "@task-tracker/core";

/** SQL for a project's effective setting text on `TodoItem t`, falling back to the default. */
export function effectiveSettingSql<T>(definition: SettingDefinition<T>): string {
  const { key } = definition;
  const fallback = definition.format(definition.defaultValue);
  return `COALESCE((SELECT Value FROM ProjectSetting WHERE ProjectId = t.ProjectId AND Key = '${key}'), (SELECT Value FROM GlobalSetting WHERE Key = '${key}'), '${fallback}')`;
}

/** The legacy `ReminderMode.None` value. */
const NONE_MODE = 1;

/**
 * Open dated items on `TodoItem t` whose effective reminder is not None (§7.12).
 * Only stored text that reads as false turns reminders off, so malformed text
 * keeps the enabled default, as Core does. Shared by the scheduler and `has:reminder`.
 */
export const REMINDER_ELIGIBLE_SQL = [
  "t.CompletedAtUtc IS NULL",
  "t.DueDate IS NOT NULL",
  `COALESCE(t.ReminderMode, 0) <> ${NONE_MODE}`,
  `lower(trim(${effectiveSettingSql(SettingsCatalogue.remindersEnabled)})) <> 'false'`,
].join(" AND ");
