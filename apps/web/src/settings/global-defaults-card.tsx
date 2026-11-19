import { Input } from "@base-ui/react/input";
import { useAtomSet } from "@effect/atom-react";
import type { GlobalSettings } from "@task-tracker/contracts";
import { useEffect, useRef, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { PROJECTS_KEY } from "../rpc/project-queries.js";
import {
  invalidateSettingsKeysAtom,
  previewGlobalAutoCompleteAtom,
  saveGlobalSettingsAtom,
  SETTINGS_KEY,
} from "../rpc/settings-queries.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { SectionCard } from "../ui/section-card.js";
import { Select } from "../ui/select.js";
import { confirmSettingsSave } from "./confirm-reconciliation.js";
import {
  createDurationDraft,
  DURATION_UNITS,
  type DurationFieldDraft,
  type DurationUnit,
  resolveDurationFieldTicks,
  validateThresholdTicks,
} from "./duration-input.js";

type Global = typeof GlobalSettings.Type;

/** Props for {@link GlobalDefaultsCard}. */
export interface GlobalDefaultsCardProps {
  readonly initial: Global;
  readonly onDirtyChange: (dirty: boolean) => void;
}

const numberInputClass =
  "h-9 w-full rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg tabular-nums outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus";

function sameGlobal(left: Global, right: Global) {
  return (
    left.autoCompleteParents === right.autoCompleteParents &&
    left.urgencyYellowThreshold === right.urgencyYellowThreshold &&
    left.urgencyRedThreshold === right.urgencyRedThreshold
  );
}

interface ThresholdFieldRowProps {
  readonly id: string;
  readonly label: string;
  readonly dotClass: string;
  readonly draft: DurationFieldDraft;
  readonly onTextChange: (text: string) => void;
  readonly onUnitChange: (unit: DurationUnit) => void;
  readonly amountTestId: string;
  readonly unitTestId: string;
}

function ThresholdFieldRow({
  id,
  label,
  dotClass,
  draft,
  onTextChange,
  onUnitChange,
  amountTestId,
  unitTestId,
}: ThresholdFieldRowProps) {
  return (
    <>
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-fg">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotClass}`} />
        {label}
      </label>
      <Input
        id={id}
        value={draft.text}
        onValueChange={onTextChange}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        data-testid={amountTestId}
        className={numberInputClass}
      />
      <Select
        value={draft.unit}
        onValueChange={onUnitChange}
        options={DURATION_UNITS}
        ariaLabel={`${label} unit`}
        testId={unitTestId}
      />
    </>
  );
}

/**
 * Edits global auto-complete and urgency defaults. Thresholds save together
 * and prompt when enabling auto-complete changes parent completion states.
 */
export function GlobalDefaultsCard({ initial, onDirtyChange }: GlobalDefaultsCardProps) {
  const [saved, setSaved] = useState<Global>(initial);
  const [autoComplete, setAutoComplete] = useState(initial.autoCompleteParents);
  const [yellow, setYellow] = useState(() =>
    createDurationDraft(initial.urgencyYellowThreshold, "days"),
  );
  const [red, setRed] = useState(() => createDurationDraft(initial.urgencyRedThreshold, "hours"));
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prevInitialRef = useRef(initial);

  const previewAutoComplete = useAtomSet(previewGlobalAutoCompleteAtom, { mode: "promiseExit" });
  const saveGlobal = useAtomSet(saveGlobalSettingsAtom, { mode: "promiseExit" });
  const invalidateKeys = useAtomSet(invalidateSettingsKeysAtom, { mode: "promise" });

  useEffect(() => {
    if (sameGlobal(prevInitialRef.current, initial)) {
      return;
    }
    prevInitialRef.current = initial;
    if (sameGlobal(saved, initial)) {
      return;
    }
    setSaved(initial);
    setAutoComplete(initial.autoCompleteParents);
    setYellow(createDurationDraft(initial.urgencyYellowThreshold, "days"));
    setRed(createDurationDraft(initial.urgencyRedThreshold, "hours"));
    setServerError(null);
  }, [initial, saved]);

  const yellowTicks = resolveDurationFieldTicks(yellow);
  const redTicks = resolveDurationFieldTicks(red);
  const validationError = validateThresholdTicks(yellowTicks, redTicks);
  const isDirty =
    autoComplete !== saved.autoCompleteParents ||
    yellowTicks !== saved.urgencyYellowThreshold ||
    redTicks !== saved.urgencyRedThreshold;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const error = validationError ?? serverError;
  const canSave = !saving && isDirty && validationError === null;

  const handleSave = async () => {
    if (!canSave || yellowTicks === null || redTicks === null) {
      return;
    }
    const next: Global = {
      autoCompleteParents: autoComplete,
      urgencyYellowThreshold: yellowTicks,
      urgencyRedThreshold: redTicks,
    };
    setSaving(true);
    setServerError(null);
    const outcome = await confirmSettingsSave({
      turnsAutoCompleteOn: !saved.autoCompleteParents && next.autoCompleteParents,
      preview: () => previewAutoComplete({ payload: undefined }),
      save: (approval) =>
        saveGlobal({
          payload: approval === undefined ? { settings: next } : { settings: next, approval },
        }),
    });
    setSaving(false);
    if (outcome.kind === "failed") {
      setServerError(describeRpcFailure(outcome.cause));
      return;
    }
    if (outcome.kind === "applied") {
      setSaved(next);
      await invalidateKeys([SETTINGS_KEY, PROJECTS_KEY]);
    }
  };

  return (
    <SectionCard title="Global defaults" testId="global-defaults-card">
      <div className="flex flex-col gap-4">
        <Checkbox
          checked={autoComplete}
          onCheckedChange={(checked) => {
            setAutoComplete(checked);
            setServerError(null);
          }}
          testId="global-auto-complete"
        >
          Automatically complete parents when all sub-items are complete
        </Checkbox>

        <div className="grid grid-cols-1 items-center gap-x-3 gap-y-2.5 sm:grid-cols-[13rem_6.5rem_6.5rem]">
          <ThresholdFieldRow
            id="global-yellow-amount"
            label="Yellow urgency threshold"
            dotClass="bg-urgency-approaching"
            draft={yellow}
            onTextChange={(text) => {
              setYellow((prev) => ({ ...prev, text, exactTicks: null }));
              setServerError(null);
            }}
            onUnitChange={(unit) => {
              setYellow((prev) => ({ ...prev, unit, exactTicks: null }));
              setServerError(null);
            }}
            amountTestId="global-yellow-amount"
            unitTestId="global-yellow-unit"
          />
          <ThresholdFieldRow
            id="global-red-amount"
            label="Red urgency threshold"
            dotClass="bg-urgency-overdue"
            draft={red}
            onTextChange={(text) => {
              setRed((prev) => ({ ...prev, text, exactTicks: null }));
              setServerError(null);
            }}
            onUnitChange={(unit) => {
              setRed((prev) => ({ ...prev, unit, exactTicks: null }));
              setServerError(null);
            }}
            amountTestId="global-red-amount"
            unitTestId="global-red-unit"
          />
        </div>

        {error === null ? null : (
          <p role="alert" data-testid="global-settings-error" className="text-[13px] text-danger">
            {error}
          </p>
        )}

        <div>
          <Button
            variant="primary"
            disabled={!canSave}
            aria-busy={saving || undefined}
            onClick={() => void handleSave()}
            data-testid="save-global-settings"
          >
            Save defaults
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
