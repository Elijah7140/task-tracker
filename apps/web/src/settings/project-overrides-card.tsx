import { useAtomSet } from "@effect/atom-react";
import type {
  GlobalSettings,
  ProjectSettingOverrides,
  ProjectSettings,
} from "@task-tracker/contracts";
import { useCallback, useEffect, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { missingEntityMessage } from "../rpc/missing-entity.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import {
  invalidateSettingsKeysAtom,
  previewProjectAutoCompleteAtom,
  projectSettingsKey,
  saveProjectSettingsAtom,
} from "../rpc/settings-queries.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { SectionCard } from "../ui/section-card.js";
import { confirmSettingsSave } from "./confirm-reconciliation.js";
import {
  createDurationDraft,
  type DurationFieldDraft,
  resolveDurationFieldTicks,
  validateThresholdTicks,
} from "./duration-input.js";
import { ProjectOverrideRow } from "./project-override-row.js";
import { ThresholdInput } from "./threshold-input.js";
import { useExternalReset } from "./use-external-reset.js";

type Global = typeof GlobalSettings.Type;
type Overrides = typeof ProjectSettingOverrides.Type;
type Effective = typeof ProjectSettings.Type;

/** Props for {@link ProjectOverridesCard}. */
export interface ProjectOverridesCardProps {
  readonly projectId: string;
  readonly globalDefaults: Global;
  readonly initial: Effective;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onProjectMissing: (message: string) => void;
}

/** The editable form: which settings are overridden and their values. */
interface OverrideDraft {
  readonly overrideAuto: boolean;
  readonly autoValue: boolean;
  readonly overrideYellow: boolean;
  readonly yellow: DurationFieldDraft;
  readonly overrideRed: boolean;
  readonly red: DurationFieldDraft;
}

function toSavedOverrides(settings: Effective): Overrides {
  const projectValue = <Value,>(setting: { source: string; value: Value }) =>
    setting.source === "Project" ? setting.value : null;
  return {
    autoCompleteParents: projectValue(settings.autoCompleteParents),
    urgencyYellowThreshold: projectValue(settings.urgencyYellowThreshold),
    urgencyRedThreshold: projectValue(settings.urgencyRedThreshold),
  };
}

function sameOverrides(left: Overrides, right: Overrides) {
  return (
    left.autoCompleteParents === right.autoCompleteParents &&
    left.urgencyYellowThreshold === right.urgencyYellowThreshold &&
    left.urgencyRedThreshold === right.urgencyRedThreshold
  );
}

function draftFrom(settings: Effective): OverrideDraft {
  return {
    overrideAuto: settings.autoCompleteParents.source === "Project",
    autoValue: settings.autoCompleteParents.value,
    overrideYellow: settings.urgencyYellowThreshold.source === "Project",
    yellow: createDurationDraft(settings.urgencyYellowThreshold.value, "days"),
    overrideRed: settings.urgencyRedThreshold.source === "Project",
    red: createDurationDraft(settings.urgencyRedThreshold.value, "hours"),
  };
}

/** Whether one override differs from the saved one. */
function overrideChanged<Value>(overridden: boolean, value: Value, saved: Value | null) {
  return overridden !== (saved !== null) || (overridden && value !== saved);
}

/** Turning an override off shows the inherited global value again. */
function toggledDraft(
  draft: OverrideDraft,
  setting: "auto" | "yellow" | "red",
  checked: boolean,
  globalDefaults: Global,
): OverrideDraft {
  switch (setting) {
    case "auto":
      return checked
        ? { ...draft, overrideAuto: true }
        : { ...draft, overrideAuto: false, autoValue: globalDefaults.autoCompleteParents };
    case "yellow":
      return checked
        ? { ...draft, overrideYellow: true }
        : {
            ...draft,
            overrideYellow: false,
            yellow: createDurationDraft(globalDefaults.urgencyYellowThreshold, "days"),
          };
    case "red":
      return checked
        ? { ...draft, overrideRed: true }
        : {
            ...draft,
            overrideRed: false,
            red: createDurationDraft(globalDefaults.urgencyRedThreshold, "hours"),
          };
  }
}

/** Draft, saved overrides and validation for the project overrides form. */
function useOverrideDraft(initial: Effective, globalDefaults: Global) {
  const [saved, setSaved] = useState<Overrides>(() => toSavedOverrides(initial));
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const [serverError, setServerError] = useState<string | null>(null);
  const reset = useCallback(() => {
    setSaved(toSavedOverrides(initial));
    setDraft(draftFrom(initial));
    setServerError(null);
  }, [initial]);
  useExternalReset(toSavedOverrides(initial), saved, sameOverrides, reset);

  const edit = (change: Partial<OverrideDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setServerError(null);
  };
  const toggle = (setting: "auto" | "yellow" | "red", checked: boolean) => {
    setDraft((current) => toggledDraft(current, setting, checked, globalDefaults));
    setServerError(null);
  };
  const derived = deriveOverrideState(draft, saved, globalDefaults);
  return { saved, setSaved, draft, edit, toggle, serverError, setServerError, ...derived };
}

/** Ticks, dirtiness, validation and the overrides the draft would save. */
function deriveOverrideState(draft: OverrideDraft, saved: Overrides, globalDefaults: Global) {
  const yellowTicks = resolveDurationFieldTicks(draft.yellow);
  const redTicks = resolveDurationFieldTicks(draft.red);
  const effectiveYellow = draft.overrideYellow
    ? yellowTicks
    : globalDefaults.urgencyYellowThreshold;
  const effectiveRed = draft.overrideRed ? redTicks : globalDefaults.urgencyRedThreshold;
  const isDirty =
    overrideChanged(draft.overrideAuto, draft.autoValue, saved.autoCompleteParents) ||
    overrideChanged(draft.overrideYellow, yellowTicks, saved.urgencyYellowThreshold) ||
    overrideChanged(draft.overrideRed, redTicks, saved.urgencyRedThreshold);
  const overrides: Overrides = {
    autoCompleteParents: draft.overrideAuto ? draft.autoValue : null,
    urgencyYellowThreshold: draft.overrideYellow ? yellowTicks : null,
    urgencyRedThreshold: draft.overrideRed ? redTicks : null,
  };
  return {
    isDirty,
    overrides,
    validationError: validateThresholdTicks(effectiveYellow, effectiveRed),
  };
}

type OverrideForm = ReturnType<typeof useOverrideDraft>;

interface SaveOverridesOptions {
  readonly projectId: string;
  readonly globalDefaults: Global;
  readonly form: OverrideForm;
  readonly onProjectMissing: (message: string) => void;
}

/** Saves the overrides, confirming parent reconciliation when auto-complete turns on. */
function useSaveOverrides({
  projectId,
  globalDefaults,
  form,
  onProjectMissing,
}: SaveOverridesOptions) {
  const [saving, setSaving] = useState(false);
  const previewAutoComplete = useAtomSet(previewProjectAutoCompleteAtom, { mode: "promiseExit" });
  const saveProject = useAtomSet(saveProjectSettingsAtom, { mode: "promiseExit" });
  const invalidateKeys = useAtomSet(invalidateSettingsKeysAtom, { mode: "promise" });
  const canSave = !saving && form.isDirty && form.validationError === null;

  const save = async () => {
    if (!canSave) {
      return;
    }
    const { overrides } = form;
    const effectiveAuto = (value: boolean | null) => value ?? globalDefaults.autoCompleteParents;
    setSaving(true);
    form.setServerError(null);
    const outcome = await confirmSettingsSave({
      turnsAutoCompleteOn:
        !effectiveAuto(form.saved.autoCompleteParents) &&
        effectiveAuto(overrides.autoCompleteParents),
      preview: () => previewAutoComplete({ payload: { projectId } }),
      save: (approval) =>
        saveProject({
          payload:
            approval === undefined ? { projectId, overrides } : { projectId, overrides, approval },
        }),
    });
    setSaving(false);
    if (outcome.kind === "failed") {
      const missing = missingEntityMessage(outcome.cause, "Project");
      if (missing !== undefined) {
        onProjectMissing(missing);
      } else {
        form.setServerError(describeRpcFailure(outcome.cause));
      }
    } else if (outcome.kind === "applied") {
      form.setSaved(overrides);
      await invalidateKeys([projectSettingsKey(projectId), PROJECTS_KEY]);
    }
  };

  return { save, saving, canSave };
}

function AutoCompleteOverrideRow({ form }: { readonly form: OverrideForm }) {
  return (
    <ProjectOverrideRow
      label="Automatic parent completion"
      overridden={form.draft.overrideAuto}
      onOverriddenChange={(checked) => form.toggle("auto", checked)}
      onReset={() => form.toggle("auto", false)}
      overrideTestId="project-auto-complete-override"
      sourceTestId="project-auto-complete-source"
      resetTestId="project-auto-complete-reset"
    >
      <Checkbox
        checked={form.draft.autoValue}
        onCheckedChange={(autoValue) => form.edit({ autoValue })}
        disabled={!form.draft.overrideAuto}
        ariaLabel="Automatically complete parents when all sub-items are complete"
        testId="project-auto-complete"
      >
        On
      </Checkbox>
    </ProjectOverrideRow>
  );
}

interface ThresholdOverrideRowProps {
  readonly form: OverrideForm;
  readonly setting: "yellow" | "red";
}

function ThresholdOverrideRow({ form, setting }: ThresholdOverrideRowProps) {
  const isYellow = setting === "yellow";
  const overridden = isYellow ? form.draft.overrideYellow : form.draft.overrideRed;
  const draft = isYellow ? form.draft.yellow : form.draft.red;
  const amountId = `project-${setting}-amount`;
  const updateText = (text: string) => {
    const next = { ...draft, text, exactTicks: null };
    form.edit(isYellow ? { yellow: next } : { red: next });
  };
  return (
    <ProjectOverrideRow
      label={isYellow ? "Yellow urgency threshold" : "Red urgency threshold"}
      labelFor={amountId}
      dotClass={isYellow ? "bg-urgency-approaching" : "bg-urgency-overdue"}
      overridden={overridden}
      onOverriddenChange={(checked) => form.toggle(setting, checked)}
      onReset={() => form.toggle(setting, false)}
      overrideTestId={`project-${setting}-override`}
      sourceTestId={`project-${setting}-source`}
      resetTestId={`project-${setting}-reset`}
    >
      <ThresholdInput
        id={amountId}
        value={draft.text}
        onValueChange={updateText}
        disabled={!overridden}
        testId={amountId}
        widthClass="w-24"
      />
      <span className="text-sm text-fg-muted">{isYellow ? "days" : "hours"}</span>
    </ProjectOverrideRow>
  );
}

/**
 * Edits per-project setting overrides and shows inherited global values.
 * Resetting an override reverts the form immediately and clears it on Save.
 */
export function ProjectOverridesCard({
  projectId,
  globalDefaults,
  initial,
  onDirtyChange,
  onProjectMissing,
}: ProjectOverridesCardProps) {
  const form = useOverrideDraft(initial, globalDefaults);
  const { save, saving, canSave } = useSaveOverrides({
    projectId,
    globalDefaults,
    form,
    onProjectMissing,
  });
  const error = form.validationError ?? form.serverError;

  useEffect(() => {
    onDirtyChange(form.isDirty);
  }, [form.isDirty, onDirtyChange]);

  return (
    <SectionCard
      title="Overrides"
      description="Tick Override to use a value for this project instead of the global default."
      testId="project-overrides-card"
    >
      <div className="flex flex-col">
        <AutoCompleteOverrideRow form={form} />
        <ThresholdOverrideRow form={form} setting="yellow" />
        <ThresholdOverrideRow form={form} setting="red" />
      </div>
      {error === null ? null : (
        <p role="alert" data-testid="project-settings-error" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div>
        <Button
          variant="primary"
          disabled={!canSave}
          aria-busy={saving || undefined}
          onClick={() => void save()}
          data-testid="save-project-settings"
        >
          Save
        </Button>
      </div>
    </SectionCard>
  );
}
