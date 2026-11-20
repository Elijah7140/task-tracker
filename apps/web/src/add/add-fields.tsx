import { Input } from "@base-ui/react/input";
import type { ReactNode, Ref } from "react";
import { ClearableInput } from "../editor/clearable-input.js";
import { EditorField } from "../editor/editor-field.js";
import { REMINDER_OFFSETS } from "../editor/reminder-draft.js";
import { Checkbox } from "../ui/checkbox.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Select, type SelectOption } from "../ui/select.js";
import type { AddDraftTextKey, AddItemDraft } from "./add-item-draft.js";
import { NO_ENTRY } from "./ticket-list-options.js";

/** What every add field reads and writes: the shared draft and its setter. */
export interface DraftProps {
  readonly draft: AddItemDraft;
  readonly onChange: (change: Partial<AddItemDraft>) => void;
}

/** A labelled single-line text box bound to one draft field. */
export function DraftText({
  draft,
  onChange,
  field,
  label,
  testId,
  inputRef,
  inputMode,
}: DraftProps & {
  readonly field: AddDraftTextKey;
  readonly label: string;
  readonly testId: string;
  readonly inputRef?: Ref<HTMLInputElement> | undefined;
  readonly inputMode?: "decimal" | "numeric" | undefined;
}) {
  return (
    <EditorField label={label}>
      <Input
        ref={inputRef}
        value={draft[field]}
        onValueChange={(value: string) => onChange({ [field]: value })}
        data-testid={testId}
        inputMode={inputMode}
        autoComplete="off"
        className={fieldStyles.compactControl}
      />
    </EditorField>
  );
}

/** A labelled multi-line box bound to one draft field. Enter adds a line here. */
export function DraftArea({
  draft,
  onChange,
  field,
  label,
  testId,
}: DraftProps & {
  readonly field: AddDraftTextKey;
  readonly label: string;
  readonly testId: string;
}) {
  return (
    <EditorField label={label}>
      <textarea
        value={draft[field]}
        onChange={(event) => onChange({ [field]: event.target.value })}
        data-testid={testId}
        rows={3}
        className={fieldStyles.textarea}
      />
    </EditorField>
  );
}

/** A labelled dropdown bound to one draft field, where "none" stores an empty value. */
export function DraftSelect({
  draft,
  onChange,
  field,
  label,
  testId,
  options,
  onSelected,
}: DraftProps & {
  readonly field: AddDraftTextKey;
  readonly label: string;
  readonly testId: string;
  readonly options: ReadonlyArray<SelectOption<string>>;
  /** Extra changes to apply with the choice, such as clearing a dependent level. */
  readonly onSelected?: ((value: string) => Partial<AddItemDraft>) | undefined;
}) {
  const value = draft[field] === "" ? NO_ENTRY : draft[field];
  return (
    <EditorField label={label}>
      <Select
        value={value}
        onValueChange={(next) => {
          const stored = next === NO_ENTRY ? "" : next;
          onChange({ [field]: stored, ...onSelected?.(stored) });
        }}
        options={options}
        ariaLabel={label}
        testId={testId}
        size="sm"
        className="w-full"
      />
    </EditorField>
  );
}

/** A labelled date, time or date-time input with a clear button. */
export function DraftDate({
  draft,
  onChange,
  field,
  label,
  type,
  testId,
}: DraftProps & {
  readonly field: AddDraftTextKey;
  readonly label: string;
  readonly type: "date" | "time" | "datetime-local";
  readonly testId: string;
}) {
  return (
    <EditorField label={label}>
      <ClearableInput
        type={type}
        value={draft[field]}
        onValueChange={(value) => onChange({ [field]: value })}
        clearLabel={`Clear ${label.toLowerCase()}`}
        testId={testId}
        clearTestId={`${testId}-clear`}
      />
    </EditorField>
  );
}

const REMINDER_OPTIONS: ReadonlyArray<SelectOption<string>> = [
  { value: "default", label: "Default" },
  { value: "none", label: "None" },
  ...REMINDER_OFFSETS.map(({ minutes, label }) => ({ value: String(minutes), label })),
];

/** The reminder choice (§7.12), which needs a due date to fire. */
export function DraftReminder({ draft, onChange }: DraftProps) {
  return (
    <EditorField label="Reminder">
      <Select
        value={draft.reminder}
        onValueChange={(reminder) => onChange({ reminder })}
        options={REMINDER_OPTIONS}
        ariaLabel="Reminder"
        testId="add-reminder"
        size="sm"
        className="w-full"
      />
    </EditorField>
  );
}

/** A checkbox bound to one of the draft's yes/no ticket flags. */
export function DraftFlag({
  draft,
  onChange,
  field,
  children,
  testId,
}: DraftProps & {
  readonly field: "isUrgent" | "isSystemOutage";
  readonly children: ReactNode;
  readonly testId: string;
}) {
  return (
    <Checkbox
      checked={draft[field]}
      onCheckedChange={(checked) => onChange({ [field]: checked })}
      testId={testId}
    >
      {children}
    </Checkbox>
  );
}

/** A titled column of fields in the detailed add view. */
export function FieldColumn({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1.5">
      <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
