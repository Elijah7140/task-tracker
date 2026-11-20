import type { EffectiveSettings, EffectiveValue } from "./effective-settings.js";
import type { SettingDefinition } from "./setting-definition.js";
import { SettingsCatalogue } from "./settings-catalogue.js";

/** Read a permitted project override, then global text, then the built-in default. */
export function resolveValue<T>(
  definition: SettingDefinition<T>,
  global: ReadonlyMap<string, string>,
  project: ReadonlyMap<string, string>,
): EffectiveValue<T> {
  const projectText = definition.projectOverridable ? project.get(definition.key) : undefined;
  if (projectText !== undefined) {
    return { value: definition.parse(projectText), source: "Project" };
  }

  const globalText = global.get(definition.key);
  const value = globalText === undefined ? definition.defaultValue : definition.parse(globalText);
  return { value, source: "Global" };
}

/** Resolve all built-in settings for one project. */
export function resolve(
  global: ReadonlyMap<string, string>,
  project: ReadonlyMap<string, string>,
): EffectiveSettings {
  return {
    autoCompleteParents: resolveValue(SettingsCatalogue.autoCompleteParents, global, project),
    urgencyYellowThreshold: resolveValue(SettingsCatalogue.urgencyYellowThreshold, global, project),
    urgencyRedThreshold: resolveValue(SettingsCatalogue.urgencyRedThreshold, global, project),
    workspaceCardColumns: resolveValue(SettingsCatalogue.workspaceCardColumns, global, project),
  };
}

/** Check whether a project's effective thresholds satisfy zero ≤ red ≤ yellow. */
export function hasValidThresholds(settings: EffectiveSettings): boolean {
  const red = settings.urgencyRedThreshold.value;
  return red >= 0n && red <= settings.urgencyYellowThreshold.value;
}
