import { SettingsCatalogue } from "../../settings/settings-catalogue.js";
import type { SettingDefinition } from "../../settings/setting-definition.js";
import type { IssueList } from "../transfer-issue.js";
import type { SettingsDocument } from "./export-document.js";
import { propertyPath } from "./json-path.js";

/** The project settings an import reads, in the legacy order; unknown keys are ignored. */
export const IMPORTED_PROJECT_SETTINGS: ReadonlyArray<SettingDefinition<unknown>> = [
  SettingsCatalogue.autoCompleteParents,
  SettingsCatalogue.urgencyYellowThreshold,
  SettingsCatalogue.urgencyRedThreshold,
  SettingsCatalogue.remindersEnabled,
  SettingsCatalogue.defaultReminderOffset,
  SettingsCatalogue.dateOnlyReminderTime,
] as ReadonlyArray<SettingDefinition<unknown>>;

function problem(definition: SettingDefinition<unknown>, text: string | null): string | null {
  try {
    definition.parse(text ?? "");
    return null;
  } catch (error) {
    if (error instanceof RangeError) {
      return `Invalid value for setting '${definition.key}': ${(error as Error).message}`;
    }
    if (error instanceof SyntaxError) {
      return error.message;
    }
    throw error;
  }
}

/** Checks that the setting values in an import document can be read. */
export function validateSettings(
  settings: SettingsDocument | null,
  path: string,
  issues: IssueList,
) {
  if (settings === null) {
    return;
  }
  for (const definition of IMPORTED_PROJECT_SETTINGS) {
    if (!settings.has(definition.key)) {
      continue;
    }
    const message = problem(definition, settings.get(definition.key) ?? null);
    if (message !== null) {
      issues.add(propertyPath(path, definition.key), message);
    }
  }
}
