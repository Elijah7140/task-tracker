import { Input } from "@base-ui/react/input";
import { useAtomSet } from "@effect/atom-react";
import type {
  GlobalSettings,
  ProjectSettingOverrides,
  ProjectSettings,
} from "@task-tracker/contracts";
import { Cause, Option } from "effect";
import { useEffect, useRef, useState } from "react";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
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

const numberInputClass =
  "h-9 w-24 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg tabular-nums outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus disabled:bg-hover disabled:text-fg-subtle disabled:opacity-70";

function toSavedOverrides(settings: Effective): Overrides {
  return {
    autoCompleteParents:
      settings.autoCompleteParents.source === "Project" ? settings.autoCompleteParents.value : null,
    urgencyYellowThreshold:
      settings.urgencyYellowThreshold.source === "Project"
        ? settings.urgencyYellowThreshold.value
        : null,
    urgencyRedThreshold:
      settings.urgencyRedThreshold.source === "Project" ? settings.urgencyRedThreshold.value : null,
  };
}

function sameOverrides(left: Overrides, right: Overrides) {
  return (
    left.autoCompleteParents === right.autoCompleteParents &&
    left.urgencyYellowThreshold === right.urgencyYellowThreshold &&
    left.urgencyRedThreshold === right.urgencyRedThreshold
  );
}

function missingProjectMessage(cause: Cause.Cause<RpcFailure>): string | undefined {
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && error.value._tag === "NotFound" && error.value.entity === "Project"
    ? error.value.message
    : undefined;
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
  const initialSaved = toSavedOverrides(initial);
  const [saved, setSaved] = useState<Overrides>(initialSaved);
  const [overrideAuto, setOverrideAuto] = useState(
    initial.autoCompleteParents.source === "Project",
  );
  const [autoValue, setAutoValue] = useState(initial.autoCompleteParents.value);
  const [overrideYellow, setOverrideYellow] = useState(
    initial.urgencyYellowThreshold.source === "Project",
  );
  const [yellow, setYellow] = useState<DurationFieldDraft>(() =>
    createDurationDraft(initial.urgencyYellowThreshold.value, "days"),
  );
  const [overrideRed, setOverrideRed] = useState(initial.urgencyRedThreshold.source === "Project");
  const [red, setRed] = useState<DurationFieldDraft>(() =>
    createDurationDraft(initial.urgencyRedThreshold.value, "hours"),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prevInitialRef = useRef(initialSaved);

  const previewAutoComplete = useAtomSet(previewProjectAutoCompleteAtom, { mode: "promiseExit" });
  const saveProject = useAtomSet(saveProjectSettingsAtom, { mode: "promiseExit" });
  const invalidateKeys = useAtomSet(invalidateSettingsKeysAtom, { mode: "promise" });

  useEffect(() => {
    const incoming = toSavedOverrides(initial);
    if (sameOverrides(prevInitialRef.current, incoming)) {
      return;
    }
    prevInitialRef.current = incoming;
    if (sameOverrides(saved, incoming)) {
      return;
    }
    setSaved(incoming);
    setOverrideAuto(initial.autoCompleteParents.source === "Project");
    setAutoValue(initial.autoCompleteParents.value);
    setOverrideYellow(initial.urgencyYellowThreshold.source === "Project");
    setYellow(createDurationDraft(initial.urgencyYellowThreshold.value, "days"));
    setOverrideRed(initial.urgencyRedThreshold.source === "Project");
    setRed(createDurationDraft(initial.urgencyRedThreshold.value, "hours"));
    setServerError(null);
  }, [initial, saved]);

  const yellowTicks = resolveDurationFieldTicks(yellow);
  const redTicks = resolveDurationFieldTicks(red);
  const effectiveYellow = overrideYellow ? yellowTicks : globalDefaults.urgencyYellowThreshold;
  const effectiveRed = overrideRed ? redTicks : globalDefaults.urgencyRedThreshold;
  const validationError = validateThresholdTicks(effectiveYellow, effectiveRed);

  const isDirty =
    overrideAuto !== (saved.autoCompleteParents !== null) ||
    (overrideAuto && autoValue !== saved.autoCompleteParents) ||
    overrideYellow !== (saved.urgencyYellowThreshold !== null) ||
    (overrideYellow && yellowTicks !== saved.urgencyYellowThreshold) ||
    overrideRed !== (saved.urgencyRedThreshold !== null) ||
    (overrideRed && redTicks !== saved.urgencyRedThreshold);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const error = validationError ?? serverError;
  const canSave = !saving && isDirty && validationError === null;

  const toggleOverrideAuto = (checked: boolean) => {
    setOverrideAuto(checked);
    if (!checked) {
      setAutoValue(globalDefaults.autoCompleteParents);
    }
    setServerError(null);
  };

  const toggleOverrideYellow = (checked: boolean) => {
    setOverrideYellow(checked);
    if (!checked) {
      setYellow(createDurationDraft(globalDefaults.urgencyYellowThreshold, "days"));
    }
    setServerError(null);
  };

  const toggleOverrideRed = (checked: boolean) => {
    setOverrideRed(checked);
    if (!checked) {
      setRed(createDurationDraft(globalDefaults.urgencyRedThreshold, "hours"));
    }
    setServerError(null);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    const overrides: Overrides = {
      autoCompleteParents: overrideAuto ? autoValue : null,
      urgencyYellowThreshold: overrideYellow ? yellowTicks : null,
      urgencyRedThreshold: overrideRed ? redTicks : null,
    };
    const prevEffectiveAuto = saved.autoCompleteParents ?? globalDefaults.autoCompleteParents;
    const nextEffectiveAuto = overrides.autoCompleteParents ?? globalDefaults.autoCompleteParents;
    setSaving(true);
    setServerError(null);
    const outcome = await confirmSettingsSave({
      turnsAutoCompleteOn: !prevEffectiveAuto && nextEffectiveAuto,
      preview: () => previewAutoComplete({ payload: { projectId } }),
      save: (approval) =>
        saveProject({
          payload:
            approval === undefined ? { projectId, overrides } : { projectId, overrides, approval },
        }),
    });
    setSaving(false);
    if (outcome.kind === "failed") {
      const missing = missingProjectMessage(outcome.cause);
      if (missing !== undefined) {
        onProjectMissing(missing);
        return;
      }
      setServerError(describeRpcFailure(outcome.cause));
      return;
    }
    if (outcome.kind === "applied") {
      setSaved(overrides);
      await invalidateKeys([projectSettingsKey(projectId), PROJECTS_KEY]);
    }
  };

  return (
    <SectionCard
      title="Overrides"
      description="Tick Override to use a value for this project instead of the global default."
      testId="project-overrides-card"
    >
      <div className="flex flex-col">
        <ProjectOverrideRow
          label="Automatic parent completion"
          overridden={overrideAuto}
          onOverriddenChange={toggleOverrideAuto}
          onReset={() => toggleOverrideAuto(false)}
          overrideTestId="project-auto-complete-override"
          sourceTestId="project-auto-complete-source"
          resetTestId="project-auto-complete-reset"
        >
          <Checkbox
            checked={autoValue}
            onCheckedChange={(checked) => {
              setAutoValue(checked);
              setServerError(null);
            }}
            disabled={!overrideAuto}
            ariaLabel="Automatically complete parents when all sub-items are complete"
            testId="project-auto-complete"
          >
            On
          </Checkbox>
        </ProjectOverrideRow>

        <ProjectOverrideRow
          label="Yellow urgency threshold"
          labelFor="project-yellow-amount"
          dotClass="bg-urgency-approaching"
          overridden={overrideYellow}
          onOverriddenChange={toggleOverrideYellow}
          onReset={() => toggleOverrideYellow(false)}
          overrideTestId="project-yellow-override"
          sourceTestId="project-yellow-source"
          resetTestId="project-yellow-reset"
        >
          <Input
            id="project-yellow-amount"
            value={yellow.text}
            onValueChange={(text) => {
              setYellow((prev) => ({ ...prev, text, exactTicks: null }));
              setServerError(null);
            }}
            disabled={!overrideYellow}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            data-testid="project-yellow-amount"
            className={numberInputClass}
          />
          <span className="text-sm text-fg-muted">days</span>
        </ProjectOverrideRow>

        <ProjectOverrideRow
          label="Red urgency threshold"
          labelFor="project-red-amount"
          dotClass="bg-urgency-overdue"
          overridden={overrideRed}
          onOverriddenChange={toggleOverrideRed}
          onReset={() => toggleOverrideRed(false)}
          overrideTestId="project-red-override"
          sourceTestId="project-red-source"
          resetTestId="project-red-reset"
        >
          <Input
            id="project-red-amount"
            value={red.text}
            onValueChange={(text) => {
              setRed((prev) => ({ ...prev, text, exactTicks: null }));
              setServerError(null);
            }}
            disabled={!overrideRed}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            data-testid="project-red-amount"
            className={numberInputClass}
          />
          <span className="text-sm text-fg-muted">hours</span>
        </ProjectOverrideRow>
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
          onClick={() => void handleSave()}
          data-testid="save-project-settings"
        >
          Save
        </Button>
      </div>
    </SectionCard>
  );
}
