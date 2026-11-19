import type { EffectiveValue } from "../settings/effective-settings.js";
import type { SettingDefinition } from "../settings/setting-definition.js";
import { SettingsCatalogue } from "../settings/settings-catalogue.js";
import type { DurationTicks } from "../time/duration-ticks.js";

/** A project's effective reminder settings and their sources (§7.12). */
export interface ReminderSettings {
  readonly remindersEnabled: EffectiveValue<boolean>;
  readonly defaultReminderOffset: EffectiveValue<DurationTicks>;
  readonly dateOnlyReminderTime: EffectiveValue<Temporal.PlainTime>;
}

/** Parses stored text, falling back to the default when it is malformed. */
export function parseOrDefault<T>(definition: SettingDefinition<T>, text: string | undefined): T {
  if (text === undefined) {
    return definition.defaultValue;
  }
  try {
    return definition.parse(text);
  } catch {
    return definition.defaultValue;
  }
}

function resolveLenient<T>(
  definition: SettingDefinition<T>,
  global: ReadonlyMap<string, string>,
  project: ReadonlyMap<string, string>,
): EffectiveValue<T> {
  const projectText = project.get(definition.key);
  if (projectText !== undefined) {
    return { value: parseOrDefault(definition, projectText), source: "Project" };
  }
  return { value: parseOrDefault(definition, global.get(definition.key)), source: "Global" };
}

/**
 * Resolves the reminder settings for one project. A stored value that cannot be
 * parsed falls back to its default for that project instead of stopping every
 * reminder, as the scheduler's query does.
 */
export function resolveReminderSettings(
  global: ReadonlyMap<string, string>,
  project: ReadonlyMap<string, string>,
): ReminderSettings {
  return {
    remindersEnabled: resolveLenient(SettingsCatalogue.remindersEnabled, global, project),
    defaultReminderOffset: resolveLenient(SettingsCatalogue.defaultReminderOffset, global, project),
    dateOnlyReminderTime: resolveLenient(SettingsCatalogue.dateOnlyReminderTime, global, project),
  };
}
