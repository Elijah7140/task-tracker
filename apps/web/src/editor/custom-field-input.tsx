import { useAtomValue } from "@effect/atom-react";
import { Input } from "@base-ui/react/input";
import { AsyncResult } from "effect/reactivity";
import { useId } from "react";
import { fieldChoicesAtom } from "../rpc/custom-field-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Select } from "../ui/select.js";
import { ClearableInput } from "./clearable-input.js";
import { type BooleanSelection, type CustomFieldDraft, draftError } from "./custom-field-drafts.js";
import { EditorField } from "./editor-field.js";
import type { EditorField as EditorFieldEntry } from "./editor-fields.js";
import { BOOLEAN_OPTIONS, choiceOptions, NONE_VALUE } from "./editor-options.js";

/** Props for {@link CustomFieldInput}. */
export interface CustomFieldInputProps {
  readonly field: EditorFieldEntry;
  readonly draft: CustomFieldDraft;
  readonly onChange: (draft: CustomFieldDraft) => void;
}

interface TypedInputProps<Kind extends CustomFieldDraft["kind"]> {
  readonly name: string;
  readonly draft: Extract<CustomFieldDraft, { kind: Kind }>;
  readonly onChange: (draft: CustomFieldDraft) => void;
}

function TextInput({ name, draft, onChange }: TypedInputProps<"Text">) {
  return (
    <EditorField label={name} labelTestId="custom-field-label">
      <Input
        value={draft.text}
        onValueChange={(text: string) => onChange({ kind: "Text", text })}
        data-testid="custom-field-text"
        autoComplete="off"
        className={fieldStyles.compactControl}
      />
    </EditorField>
  );
}

function NumberInput({ name, draft, onChange }: TypedInputProps<"Number">) {
  const errorId = useId();
  const error = draftError(draft);
  return (
    <EditorField label={name} labelTestId="custom-field-label">
      <Input
        value={draft.text}
        onValueChange={(text: string) => onChange({ kind: "Number", text })}
        inputMode="decimal"
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : errorId}
        data-testid="custom-field-number"
        autoComplete="off"
        className={fieldStyles.compactControl}
      />
      {error === null ? null : (
        <p id={errorId} data-testid="custom-field-number-error" className={fieldStyles.error}>
          {error}
        </p>
      )}
    </EditorField>
  );
}

function DateInput({ name, draft, onChange }: TypedInputProps<"Date">) {
  return (
    <EditorField label={name} labelTestId="custom-field-label">
      <ClearableInput
        type="date"
        value={draft.date}
        onValueChange={(date) => onChange({ kind: "Date", date })}
        clearLabel={`Clear ${name}`}
        testId="custom-field-date"
        clearTestId="custom-field-clear-date"
      />
    </EditorField>
  );
}

function BooleanInput({ name, draft, onChange }: TypedInputProps<"Boolean">) {
  return (
    <EditorField label={name} labelTestId="custom-field-label">
      <Select
        value={draft.selection}
        onValueChange={(selection) =>
          onChange({ kind: "Boolean", selection: selection as BooleanSelection })
        }
        options={BOOLEAN_OPTIONS}
        ariaLabel={name}
        testId="custom-field-boolean"
        size="sm"
        className="w-full"
      />
    </EditorField>
  );
}

function ChoiceInput({
  name,
  draft,
  onChange,
  fieldId,
  storedChoiceId,
}: TypedInputProps<"Choice"> & {
  readonly fieldId: string;
  readonly storedChoiceId: string | null;
}) {
  const choices = useAtomValue(fieldChoicesAtom(fieldId));
  const loaded = AsyncResult.isSuccess(choices);
  const options = loaded
    ? choiceOptions(choices.value, storedChoiceId)
    : [{ value: draft.choiceId ?? NONE_VALUE, label: "Loading…" }];
  return (
    <EditorField label={name} labelTestId="custom-field-label">
      <Select
        value={draft.choiceId ?? NONE_VALUE}
        onValueChange={(value) =>
          onChange({ kind: "Choice", choiceId: value === NONE_VALUE ? null : value })
        }
        options={options}
        ariaLabel={name}
        disabled={!loaded}
        testId="custom-field-choice"
        size="sm"
        className="w-full"
      />
      {AsyncResult.isFailure(choices) ? (
        <p role="alert" className={fieldStyles.error}>
          {describeRpcFailure(choices.cause)}
        </p>
      ) : null}
    </EditorField>
  );
}

/** The input for one active custom field, chosen by its data type. */
export function CustomFieldInput({ field, draft, onChange }: CustomFieldInputProps) {
  const name = field.definition.displayName;
  switch (draft.kind) {
    case "Text":
      return <TextInput name={name} draft={draft} onChange={onChange} />;
    case "Number":
      return <NumberInput name={name} draft={draft} onChange={onChange} />;
    case "Date":
      return <DateInput name={name} draft={draft} onChange={onChange} />;
    case "Boolean":
      return <BooleanInput name={name} draft={draft} onChange={onChange} />;
    case "Choice":
      return (
        <ChoiceInput
          name={name}
          draft={draft}
          onChange={onChange}
          fieldId={field.definition.id}
          storedChoiceId={field.stored?.choiceId ?? null}
        />
      );
  }
}
