import type { GlobalSettings, ProjectSettingOverrides } from "@task-tracker/contracts";
import type {
  DurationTicks,
  EffectiveSettings,
  EffectiveValue,
  ReminderSettings,
} from "@task-tracker/core";
import type {
  ReminderDefaultsInput,
  ReminderOverridesInput,
} from "../services/settings-service.js";

function projectDuration({ value, source }: EffectiveValue<DurationTicks>) {
  return { value: value.toString(), source };
}

function parseNullableDuration(ticks: string | null): DurationTicks | null {
  return ticks === null ? null : BigInt(ticks);
}

/** Carry the settings a project can override, with sources and durations as decimal tick counts. */
export function projectOverridableSettings(settings: EffectiveSettings) {
  return {
    autoCompleteParents: settings.autoCompleteParents,
    urgencyYellowThreshold: projectDuration(settings.urgencyYellowThreshold),
    urgencyRedThreshold: projectDuration(settings.urgencyRedThreshold),
  };
}

/** Carry every resolved setting an area shows, including the global-only card columns (§7.17). */
export function projectEffectiveSettings(settings: EffectiveSettings) {
  return {
    ...projectOverridableSettings(settings),
    workspaceCardColumns: settings.workspaceCardColumns,
  };
}

/** Carry the global values without their sources, which are always global. */
export function projectGlobalSettings(settings: EffectiveSettings): typeof GlobalSettings.Type {
  const { autoCompleteParents, urgencyYellowThreshold, urgencyRedThreshold, workspaceCardColumns } =
    projectEffectiveSettings(settings);
  return {
    autoCompleteParents: autoCompleteParents.value,
    urgencyYellowThreshold: urgencyYellowThreshold.value,
    urgencyRedThreshold: urgencyRedThreshold.value,
    workspaceCardColumns: workspaceCardColumns.value,
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

const formatTime = (time: Temporal.PlainTime) => time.toString({ smallestUnit: "second" });

/** Carry effective reminder settings with sources, durations as ticks and times as `HH:mm:ss`. */
export function projectReminderSettings(reminders: ReminderSettings) {
  const { remindersEnabled, defaultReminderOffset, dateOnlyReminderTime } = reminders;
  return {
    remindersEnabled,
    defaultReminderOffset: projectDuration(defaultReminderOffset),
    dateOnlyReminderTime: {
      value: formatTime(dateOnlyReminderTime.value),
      source: dateOnlyReminderTime.source,
    },
  };
}

/** Carry global reminder defaults without sources. */
export function projectReminderDefaults(reminders: ReminderSettings) {
  const projected = projectReminderSettings(reminders);
  return {
    remindersEnabled: projected.remindersEnabled.value,
    defaultReminderOffset: projected.defaultReminderOffset.value,
    dateOnlyReminderTime: projected.dateOnlyReminderTime.value,
  };
}

const parseTime = (text: string) => Temporal.PlainTime.from(text);

/** Convert schema-validated reminder defaults for the service, if the save carried them. */
export function parseReminderDefaults(
  values: (typeof GlobalSettings.Type)["reminders"],
): ReminderDefaultsInput | undefined {
  return values === undefined
    ? undefined
    : {
        enabled: values.remindersEnabled,
        offset: BigInt(values.defaultReminderOffset),
        dateOnlyTime: parseTime(values.dateOnlyReminderTime),
      };
}

/** Convert schema-validated reminder overrides for the service, if the save carried them. */
export function parseReminderOverrides(
  values: (typeof ProjectSettingOverrides.Type)["reminders"],
): ReminderOverridesInput | undefined {
  return values === undefined
    ? undefined
    : {
        enabled: values.remindersEnabled,
        offset: parseNullableDuration(values.defaultReminderOffset),
        dateOnlyTime:
          values.dateOnlyReminderTime === null ? null : parseTime(values.dateOnlyReminderTime),
      };
}
