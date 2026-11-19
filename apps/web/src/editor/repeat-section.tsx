import { Input } from "@base-ui/react/input";
import type { Item } from "@task-tracker/contracts";
import { WEEKDAY_LABELS } from "../format/recurrence-summary.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { cx } from "../ui/class-names.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Select, type SelectOption } from "../ui/select.js";
import { ClearableInput } from "./clearable-input.js";
import { EditorField } from "./editor-field.js";
import { EditorGroup } from "./editor-group.js";
import { type RepeatDraft, type RepeatFrequency, storedRepeatDraft } from "./repeat-draft.js";

const FREQUENCIES: ReadonlyArray<SelectOption<RepeatFrequency>> = [
  { value: "None", label: "Does not repeat" },
  { value: "Daily", label: "Daily" },
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Yearly", label: "Yearly" },
];

const ANCHORS: ReadonlyArray<SelectOption<RepeatDraft["anchor"]>> = [
  { value: "DueDate", label: "From the due date" },
  { value: "CompletionDate", label: "From the completion date" },
];

const ENDS: ReadonlyArray<SelectOption<RepeatDraft["endKind"]>> = [
  { value: "Never", label: "Never" },
  { value: "OnDate", label: "On a date" },
  { value: "AfterCount", label: "After a number of occurrences" },
];

const UNITS: Record<RepeatFrequency, string> = {
  None: "",
  Daily: "days",
  Weekly: "weeks",
  Monthly: "months",
  Yearly: "years",
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Props for {@link RepeatSection}. */
export interface RepeatSectionProps {
  readonly item: typeof Item.Type;
  /** The user's draft, or null to show the stored rule. */
  readonly draft: RepeatDraft | null;
  readonly summary: string | null;
  readonly error: string | null;
  readonly onChange: (draft: RepeatDraft) => void;
  readonly onSkip: () => void;
  readonly onStop: () => void;
}

type Change = (patch: Partial<RepeatDraft>) => void;

/** A whole-number box, named by the {@link EditorField} label around it. */
function NumberInput({
  value,
  testId,
  onValueChange,
}: {
  readonly value: string;
  readonly testId: string;
  readonly onValueChange: (value: string) => void;
}) {
  return (
    <div className="w-16 shrink-0">
      <Input
        value={value}
        onValueChange={onValueChange}
        inputMode="numeric"
        data-testid={testId}
        autoComplete="off"
        className={cx(fieldStyles.compactControl, "tabular-nums")}
      />
    </div>
  );
}

function WeekdayToggles({
  weekdays,
  onChange,
}: {
  readonly weekdays: number;
  readonly onChange: Change;
}) {
  return (
    <div role="group" aria-label="Repeat on" className="grid grid-cols-7 gap-1">
      {WEEKDAY_LABELS.map((label, index) => {
        const flag = 1 << index;
        const selected = (weekdays & flag) !== 0;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={selected}
            aria-label={DAY_NAMES[index]}
            data-testid={`item-editor-repeat-weekday-${label.toLowerCase()}`}
            onClick={() => onChange({ weekdays: weekdays ^ flag })}
            className={cx(
              "h-7 min-w-0 cursor-default rounded-control border text-[13px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-focus",
              selected
                ? "border-accent bg-accent text-on-accent hover:bg-accent-hover"
                : "border-line-strong bg-canvas text-fg hover:bg-hover",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MonthDayFields({
  draft,
  onChange,
}: {
  readonly draft: RepeatDraft;
  readonly onChange: Change;
}) {
  return (
    <>
      <div className="pl-31">
        <Checkbox
          checked={draft.lastDay}
          onCheckedChange={(lastDay) => onChange({ lastDay })}
          testId="item-editor-repeat-last-day"
        >
          Last day of the month
        </Checkbox>
      </div>
      {draft.lastDay ? null : (
        <EditorField label="Day of month">
          <NumberInput
            value={draft.monthDay}
            testId="item-editor-repeat-month-day"
            onValueChange={(monthDay) => onChange({ monthDay })}
          />
        </EditorField>
      )}
    </>
  );
}

function EndFields({
  draft,
  onChange,
}: {
  readonly draft: RepeatDraft;
  readonly onChange: Change;
}) {
  return (
    <>
      <EditorField label="Ends">
        <Select
          value={draft.endKind}
          onValueChange={(endKind) => onChange({ endKind })}
          options={ENDS}
          ariaLabel="Ends"
          testId="item-editor-repeat-end"
          size="sm"
          className="w-full"
        />
      </EditorField>
      {draft.endKind === "OnDate" ? (
        <EditorField label="Last date">
          <ClearableInput
            type="date"
            value={draft.endDate}
            onValueChange={(endDate) => onChange({ endDate })}
            clearLabel="Clear last occurrence date"
            testId="item-editor-repeat-end-date"
            clearTestId="item-editor-repeat-clear-end-date"
          />
        </EditorField>
      ) : null}
      {draft.endKind === "AfterCount" ? (
        <EditorField label="Remaining">
          <div className="flex items-center gap-2">
            <NumberInput
              value={draft.count}
              testId="item-editor-repeat-count"
              onValueChange={(count) => onChange({ count })}
            />
            <span className="text-[13px] text-fg-muted">including this one</span>
          </div>
        </EditorField>
      ) : null}
    </>
  );
}

function PatternFields({
  draft,
  onChange,
}: {
  readonly draft: RepeatDraft;
  readonly onChange: Change;
}) {
  return (
    <>
      <EditorField label="Every">
        <div className="flex items-center gap-2">
          <NumberInput
            value={draft.interval}
            testId="item-editor-repeat-interval"
            onValueChange={(interval) => onChange({ interval })}
          />
          <span className="text-[13px] text-fg-muted">{UNITS[draft.frequency]}</span>
        </div>
      </EditorField>
      {draft.frequency === "Weekly" ? (
        <WeekdayToggles weekdays={draft.weekdays} onChange={onChange} />
      ) : null}
      {draft.frequency === "Monthly" ? <MonthDayFields draft={draft} onChange={onChange} /> : null}
      <EditorField label="Next date">
        <Select
          value={draft.anchor}
          onValueChange={(anchor) => onChange({ anchor })}
          options={ANCHORS}
          ariaLabel="Next date"
          testId="item-editor-repeat-anchor"
          size="sm"
          className="w-full"
        />
      </EditorField>
      <EndFields draft={draft} onChange={onChange} />
    </>
  );
}

function RepeatCommands({
  item,
  onSkip,
  onStop,
}: Pick<RepeatSectionProps, "item" | "onSkip" | "onStop">) {
  if ((item.recurrence ?? null) === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {item.completedAtUtc === null ? (
        <Button size="sm" onClick={onSkip} data-testid="item-editor-skip-repeat">
          Skip this one
        </Button>
      ) : null}
      <Button size="sm" onClick={onStop} data-testid="item-editor-stop-repeating">
        Stop repeating
      </Button>
    </div>
  );
}

/**
 * The editor's Repeat section (§7.11): frequency, interval, weekdays or day of
 * the month, the anchor and the end, with a one-line summary or the reason the
 * rule cannot be saved. Skip and Stop act on the stored rule right away.
 */
export function RepeatSection({
  item,
  draft,
  summary,
  error,
  onChange,
  onSkip,
  onStop,
}: RepeatSectionProps) {
  const shown = draft ?? storedRepeatDraft(item);
  const change: Change = (patch) => onChange({ ...shown, ...patch });
  return (
    <EditorGroup title="Repeat" testId="item-editor-repeat">
      <div className="flex flex-col gap-1.5">
        <EditorField label="Repeat">
          <Select
            value={shown.frequency}
            onValueChange={(frequency) => change({ frequency })}
            options={FREQUENCIES}
            ariaLabel="Repeat"
            testId="item-editor-repeat-frequency"
            size="sm"
            className="w-full"
          />
        </EditorField>
        {shown.frequency === "None" ? null : <PatternFields draft={shown} onChange={change} />}
        {summary === null ? null : (
          <p data-testid="item-editor-repeat-summary" className="text-[13px] font-medium text-fg">
            {summary}
          </p>
        )}
        {error === null ? null : (
          <p data-testid="item-editor-repeat-error" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <RepeatCommands item={item} onSkip={onSkip} onStop={onStop} />
      </div>
    </EditorGroup>
  );
}
