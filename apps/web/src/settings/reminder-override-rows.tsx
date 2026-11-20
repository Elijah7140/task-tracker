import type { GlobalSettings, ProjectSettings, ReminderOverrides } from "@task-tracker/contracts";
import { Checkbox } from "../ui/checkbox.js";
import { Select } from "../ui/select.js";
import { ProjectOverrideRow } from "./project-override-row.js";
import { ReminderTimeInput } from "./reminder-defaults-fields.js";
import {
  DEFAULT_REMINDER_DEFAULTS,
  defaultOffsetOptions,
  displayTime,
  normalizeTime,
  reminderDefaultsOf,
} from "./reminder-settings-draft.js";

type Overrides = typeof ReminderOverrides.Type;

/** A project's reminder overrides being edited: which are on and their values. */
export interface ReminderOverrideDraft {
  readonly overrideEnabled: boolean;
  readonly enabled: boolean;
  readonly overrideOffset: boolean;
  readonly offset: string;
  readonly overrideTime: boolean;
  readonly time: string;
}

/** One of the three reminder overrides. */
export type ReminderOverrideKey = "enabled" | "offset" | "time";

const NO_OVERRIDES: Overrides = {
  remindersEnabled: null,
  defaultReminderOffset: null,
  dateOnlyReminderTime: null,
};

/** The project's saved reminder overrides. */
export function savedReminderOverrides(settings: typeof ProjectSettings.Type): Overrides {
  const reminders = settings.reminders;
  if (reminders === undefined) {
    return NO_OVERRIDES;
  }
  const projectValue = <Value,>(setting: { source: string; value: Value }) =>
    setting.source === "Project" ? setting.value : null;
  return {
    remindersEnabled: projectValue(reminders.remindersEnabled),
    defaultReminderOffset: projectValue(reminders.defaultReminderOffset),
    dateOnlyReminderTime: projectValue(reminders.dateOnlyReminderTime),
  };
}

/** Whether two sets of reminder overrides are the same. */
export function sameReminderOverrides(left: Overrides, right: Overrides): boolean {
  const time = (value: string | null) => (value === null ? null : normalizeTime(value));
  return (
    left.remindersEnabled === right.remindersEnabled &&
    left.defaultReminderOffset === right.defaultReminderOffset &&
    time(left.dateOnlyReminderTime) === time(right.dateOnlyReminderTime)
  );
}

/** The form fields for a project's effective reminder settings. */
export function reminderOverrideDraftFrom(
  settings: typeof ProjectSettings.Type,
): ReminderOverrideDraft {
  const reminders = settings.reminders;
  const defaults = DEFAULT_REMINDER_DEFAULTS;
  return {
    overrideEnabled: reminders?.remindersEnabled.source === "Project",
    enabled: reminders?.remindersEnabled.value ?? defaults.remindersEnabled,
    overrideOffset: reminders?.defaultReminderOffset.source === "Project",
    offset: reminders?.defaultReminderOffset.value ?? defaults.defaultReminderOffset,
    overrideTime: reminders?.dateOnlyReminderTime.source === "Project",
    time: displayTime(reminders?.dateOnlyReminderTime.value ?? defaults.dateOnlyReminderTime),
  };
}

/** Turning an override off shows the inherited global value again. */
export function toggleReminderOverride(
  draft: ReminderOverrideDraft,
  key: ReminderOverrideKey,
  checked: boolean,
  global: typeof GlobalSettings.Type,
): ReminderOverrideDraft {
  const defaults = reminderDefaultsOf(global);
  switch (key) {
    case "enabled":
      return checked
        ? { ...draft, overrideEnabled: true }
        : { ...draft, overrideEnabled: false, enabled: defaults.remindersEnabled };
    case "offset":
      return checked
        ? { ...draft, overrideOffset: true }
        : { ...draft, overrideOffset: false, offset: defaults.defaultReminderOffset };
    case "time":
      return checked
        ? { ...draft, overrideTime: true }
        : { ...draft, overrideTime: false, time: displayTime(defaults.dateOnlyReminderTime) };
  }
}

/** The overrides the fields would save, or null while an overridden time is not a time. */
export function reminderOverridesFrom(draft: ReminderOverrideDraft): Overrides | null {
  const time = draft.overrideTime ? normalizeTime(draft.time) : null;
  if (draft.overrideTime && time === null) {
    return null;
  }
  return {
    remindersEnabled: draft.overrideEnabled ? draft.enabled : null,
    defaultReminderOffset: draft.overrideOffset ? draft.offset : null,
    dateOnlyReminderTime: time,
  };
}

/** Props for {@link ReminderOverrideRows}. */
export interface ReminderOverrideRowsProps {
  readonly draft: ReminderOverrideDraft;
  readonly onChange: (change: Partial<ReminderOverrideDraft>) => void;
  readonly onToggle: (key: ReminderOverrideKey, checked: boolean) => void;
}

/** Project overrides for whether items remind, the default offset and the date-only time. */
export function ReminderOverrideRows({ draft, onChange, onToggle }: ReminderOverrideRowsProps) {
  return (
    <>
      <ProjectOverrideRow
        label="Reminders"
        overridden={draft.overrideEnabled}
        onOverriddenChange={(checked) => onToggle("enabled", checked)}
        onReset={() => onToggle("enabled", false)}
        overrideTestId="project-reminders-override"
        sourceTestId="project-reminders-source"
        resetTestId="project-reminders-reset"
      >
        <Checkbox
          checked={draft.enabled}
          onCheckedChange={(enabled) => onChange({ enabled })}
          disabled={!draft.overrideEnabled}
          ariaLabel="Remind me about open items with a due date"
          testId="project-reminders-enabled"
        >
          On
        </Checkbox>
      </ProjectOverrideRow>
      <ProjectOverrideRow
        label="Default reminder"
        overridden={draft.overrideOffset}
        onOverriddenChange={(checked) => onToggle("offset", checked)}
        onReset={() => onToggle("offset", false)}
        overrideTestId="project-reminder-offset-override"
        sourceTestId="project-reminder-offset-source"
        resetTestId="project-reminder-offset-reset"
      >
        <Select
          value={draft.offset}
          onValueChange={(offset) => onChange({ offset })}
          options={defaultOffsetOptions(draft.offset)}
          ariaLabel="Default reminder"
          disabled={!draft.overrideOffset}
          testId="project-reminder-offset"
          className="w-full"
        />
      </ProjectOverrideRow>
      <ProjectOverrideRow
        label="Date-only reminder time"
        labelFor="project-reminder-time"
        overridden={draft.overrideTime}
        onOverriddenChange={(checked) => onToggle("time", checked)}
        onReset={() => onToggle("time", false)}
        overrideTestId="project-reminder-time-override"
        sourceTestId="project-reminder-time-source"
        resetTestId="project-reminder-time-reset"
      >
        <ReminderTimeInput
          id="project-reminder-time"
          value={draft.time}
          onValueChange={(time) => onChange({ time })}
          disabled={!draft.overrideTime}
          testId="project-reminder-time"
        />
      </ProjectOverrideRow>
    </>
  );
}
