import { useAtomSet } from "@effect/atom-react";
import type { GlobalSettings } from "@task-tracker/contracts";
import { useCallback, useEffect, useState } from "react";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
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
import { ThresholdInput } from "./threshold-input.js";
import { useExternalReset } from "./use-external-reset.js";

type Global = typeof GlobalSettings.Type;

/** Props for {@link GlobalDefaultsCard}. */
export interface GlobalDefaultsCardProps {
  readonly initial: Global;
  readonly onDirtyChange: (dirty: boolean) => void;
}

const CARD_COLUMN_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
] as const;

/** The editable form values. Thresholds keep their typed text and unit. */
interface GlobalDraft {
  readonly autoComplete: boolean;
  readonly yellow: DurationFieldDraft;
  readonly red: DurationFieldDraft;
  readonly cardColumns: number;
}

function sameGlobal(left: Global, right: Global) {
  return (
    left.autoCompleteParents === right.autoCompleteParents &&
    left.urgencyYellowThreshold === right.urgencyYellowThreshold &&
    left.urgencyRedThreshold === right.urgencyRedThreshold &&
    left.workspaceCardColumns === right.workspaceCardColumns
  );
}

function draftFrom(settings: Global): GlobalDraft {
  return {
    autoComplete: settings.autoCompleteParents,
    yellow: createDurationDraft(settings.urgencyYellowThreshold, "days"),
    red: createDurationDraft(settings.urgencyRedThreshold, "hours"),
    cardColumns: settings.workspaceCardColumns,
  };
}

/** Draft, saved values and validation for the global defaults form. */
function useGlobalDraft(initial: Global) {
  const [saved, setSaved] = useState<Global>(initial);
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const [serverError, setServerError] = useState<string | null>(null);
  const reset = useCallback(() => {
    setSaved(initial);
    setDraft(draftFrom(initial));
    setServerError(null);
  }, [initial]);
  useExternalReset(initial, saved, sameGlobal, reset);

  const edit = (change: Partial<GlobalDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setServerError(null);
  };
  const yellowTicks = resolveDurationFieldTicks(draft.yellow);
  const redTicks = resolveDurationFieldTicks(draft.red);
  const isDirty =
    draft.autoComplete !== saved.autoCompleteParents ||
    yellowTicks !== saved.urgencyYellowThreshold ||
    redTicks !== saved.urgencyRedThreshold ||
    draft.cardColumns !== saved.workspaceCardColumns;
  const validationError = validateThresholdTicks(yellowTicks, redTicks);
  return {
    saved,
    setSaved,
    draft,
    edit,
    serverError,
    setServerError,
    yellowTicks,
    redTicks,
    isDirty,
    validationError,
  };
}

type GlobalForm = ReturnType<typeof useGlobalDraft>;

/** The settings the draft would save, or null while a threshold is invalid. */
function nextGlobal(form: GlobalForm): Global | null {
  if (form.yellowTicks === null || form.redTicks === null) {
    return null;
  }
  return {
    autoCompleteParents: form.draft.autoComplete,
    urgencyYellowThreshold: form.yellowTicks,
    urgencyRedThreshold: form.redTicks,
    workspaceCardColumns: form.draft.cardColumns,
  };
}

/** Saves the draft, confirming parent reconciliation when auto-complete turns on. */
function useSaveGlobalDefaults(form: GlobalForm) {
  const [saving, setSaving] = useState(false);
  const previewAutoComplete = useAtomSet(previewGlobalAutoCompleteAtom, { mode: "promiseExit" });
  const saveGlobal = useAtomSet(saveGlobalSettingsAtom, { mode: "promiseExit" });
  const invalidateKeys = useAtomSet(invalidateSettingsKeysAtom, { mode: "promise" });
  const canSave = !saving && form.isDirty && form.validationError === null;

  const save = async () => {
    const next = nextGlobal(form);
    if (!canSave || next === null) {
      return;
    }
    setSaving(true);
    form.setServerError(null);
    const outcome = await confirmSettingsSave({
      turnsAutoCompleteOn: !form.saved.autoCompleteParents && next.autoCompleteParents,
      preview: () => previewAutoComplete({ payload: undefined }),
      save: (approval) =>
        saveGlobal({
          payload: approval === undefined ? { settings: next } : { settings: next, approval },
        }),
    });
    setSaving(false);
    if (outcome.kind === "failed") {
      form.setServerError(describeRpcFailure(outcome.cause));
    } else if (outcome.kind === "applied") {
      form.setSaved(next);
      await invalidateKeys([HISTORY_KEY, SETTINGS_KEY, PROJECTS_KEY]);
    }
  };

  return { save, saving, canSave };
}

interface ThresholdFieldRowProps {
  readonly id: string;
  readonly label: string;
  readonly dotClass: string;
  readonly draft: DurationFieldDraft;
  readonly onChange: (draft: DurationFieldDraft) => void;
  readonly amountTestId: string;
  readonly unitTestId: string;
}

/** A threshold label, amount and unit. Editing either drops the exact server ticks. */
function ThresholdFieldRow({
  id,
  label,
  dotClass,
  draft,
  onChange,
  amountTestId,
  unitTestId,
}: ThresholdFieldRowProps) {
  return (
    <>
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-fg">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotClass}`} />
        {label}
      </label>
      <ThresholdInput
        id={id}
        value={draft.text}
        onValueChange={(text) => onChange({ ...draft, text, exactTicks: null })}
        testId={amountTestId}
        widthClass="w-full"
      />
      <Select
        value={draft.unit}
        onValueChange={(unit: DurationUnit) => onChange({ ...draft, unit, exactTicks: null })}
        options={DURATION_UNITS}
        ariaLabel={`${label} unit`}
        testId={unitTestId}
      />
    </>
  );
}

function GlobalThresholdRows({ form }: { readonly form: GlobalForm }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-3 gap-y-2.5 sm:grid-cols-[13rem_6.5rem_6.5rem]">
      <ThresholdFieldRow
        id="global-yellow-amount"
        label="Yellow urgency threshold"
        dotClass="bg-urgency-approaching"
        draft={form.draft.yellow}
        onChange={(yellow) => form.edit({ yellow })}
        amountTestId="global-yellow-amount"
        unitTestId="global-yellow-unit"
      />
      <ThresholdFieldRow
        id="global-red-amount"
        label="Red urgency threshold"
        dotClass="bg-urgency-overdue"
        draft={form.draft.red}
        onChange={(red) => form.edit({ red })}
        amountTestId="global-red-amount"
        unitTestId="global-red-unit"
      />
      <span aria-hidden="true" className="text-sm text-fg">
        Cards per row
      </span>
      <Select
        value={String(form.draft.cardColumns)}
        onValueChange={(value) => form.edit({ cardColumns: Number(value) })}
        options={CARD_COLUMN_OPTIONS}
        ariaLabel="Cards per row"
        testId="global-card-columns"
      />
    </div>
  );
}

/**
 * Edits global auto-complete and urgency defaults. Thresholds save together
 * and prompt when enabling auto-complete changes parent completion states.
 */
export function GlobalDefaultsCard({ initial, onDirtyChange }: GlobalDefaultsCardProps) {
  const form = useGlobalDraft(initial);
  const { save, saving, canSave } = useSaveGlobalDefaults(form);
  const error = form.validationError ?? form.serverError;

  useEffect(() => {
    onDirtyChange(form.isDirty);
  }, [form.isDirty, onDirtyChange]);

  return (
    <SectionCard title="Global defaults" testId="global-defaults-card">
      <div className="flex flex-col gap-4">
        <Checkbox
          checked={form.draft.autoComplete}
          onCheckedChange={(autoComplete) => form.edit({ autoComplete })}
          testId="global-auto-complete"
        >
          Automatically complete parents when all sub-items are complete
        </Checkbox>
        <GlobalThresholdRows form={form} />
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
            onClick={() => void save()}
            data-testid="save-global-settings"
          >
            Save defaults
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
