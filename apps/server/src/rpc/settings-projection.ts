import type { GlobalSettings, ProjectSettingOverrides } from "@task-tracker/contracts";
import type { DurationTicks, EffectiveSettings, EffectiveValue } from "@task-tracker/core";

function projectDuration({ value, source }: EffectiveValue<DurationTicks>) {
  return { value: value.toString(), source };
}

function parseNullableDuration(ticks: string | null): DurationTicks | null {
  return ticks === null ? null : BigInt(ticks);
}

/** Carry resolved settings with each value's source and durations as decimal tick counts. */
export function projectEffectiveSettings(settings: EffectiveSettings) {
  return {
    autoCompleteParents: settings.autoCompleteParents,
    urgencyYellowThreshold: projectDuration(settings.urgencyYellowThreshold),
    urgencyRedThreshold: projectDuration(settings.urgencyRedThreshold),
  };
}

/** Carry the global values without their sources, which are always global. */
export function projectGlobalSettings(settings: EffectiveSettings): typeof GlobalSettings.Type {
  const { autoCompleteParents, urgencyYellowThreshold, urgencyRedThreshold } =
    projectEffectiveSettings(settings);
  return {
    autoCompleteParents: autoCompleteParents.value,
    urgencyYellowThreshold: urgencyYellowThreshold.value,
    urgencyRedThreshold: urgencyRedThreshold.value,
  };
}

/** Convert schema-validated tick counts to the service's global save arguments. */
export function parseGlobalSettings(settings: typeof GlobalSettings.Type) {
  return [
    settings.autoCompleteParents,
    BigInt(settings.urgencyYellowThreshold),
    BigInt(settings.urgencyRedThreshold),
  ] as const;
}

/** Convert schema-validated overrides to the service's project save arguments. */
export function parseProjectOverrides(overrides: typeof ProjectSettingOverrides.Type) {
  return [
    overrides.autoCompleteParents,
    parseNullableDuration(overrides.urgencyYellowThreshold),
    parseNullableDuration(overrides.urgencyRedThreshold),
  ] as const;
}
