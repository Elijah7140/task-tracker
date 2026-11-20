import { useAtomValue } from "@effect/atom-react";
import type { SearchableField, SearchChoice, SearchScope } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { searchChoicesAtom } from "../rpc/search-queries.js";
import { fieldStyles } from "../ui/field-styles.js";
import { Select } from "../ui/select.js";
import type { ChosenChoice, FilterRowDraft } from "./filter-row-model.js";

type Field = typeof SearchableField.Type;
type Choice = typeof SearchChoice.Type;

const UNSET = "__unset__";
const BOOLEAN_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

/** Props shared by the value inputs of one filter row. */
export interface FilterValueInputsProps {
  readonly row: FilterRowDraft;
  readonly field: Field;
  readonly scope: typeof SearchScope.Type;
  readonly onChange: (patch: Partial<FilterRowDraft>) => void;
}

function Joiner({ text }: { readonly text: string }) {
  return <span className="text-xs text-fg-subtle">{text}</span>;
}

function TextInputs({ row, field, onChange }: FilterValueInputsProps) {
  const between = row.operator === "between";
  const input = (part: "first" | "second", label: string) => (
    <span className="w-40">
      <input
        type={field.dataType === "Date" ? "date" : "text"}
        inputMode={field.dataType === "Number" ? "decimal" : undefined}
        value={row[part]}
        aria-label={`${field.displayName} ${label}`}
        data-testid={`filter-value-${part}`}
        onChange={(event) => onChange({ [part]: event.target.value })}
        className={fieldStyles.compactControl}
      />
    </span>
  );
  return (
    <>
      {input("first", between ? "from" : "value")}
      {between ? <Joiner text="and" /> : null}
      {between ? input("second", "to") : null}
    </>
  );
}

function BooleanInput({ row, field, onChange }: FilterValueInputsProps) {
  return (
    <Select
      size="sm"
      value={row.booleanValue ? "true" : "false"}
      onValueChange={(value) => onChange({ booleanValue: value === "true" })}
      options={BOOLEAN_OPTIONS}
      ariaLabel={`${field.displayName} value`}
      testId="filter-value-first"
      className="w-24"
    />
  );
}

function ChoiceSelect(props: {
  readonly label: string;
  readonly testId: string;
  readonly choices: ReadonlyArray<Choice>;
  readonly chosen: ChosenChoice | null;
  readonly onChoose: (choice: ChosenChoice | null) => void;
}) {
  const options = [
    { value: UNSET, label: "Choose…" },
    ...props.choices.map((choice) => ({ value: choice.id, label: choice.label })),
  ];
  const choose = (id: string) => {
    const choice = props.choices.find((candidate) => candidate.id === id);
    props.onChoose(choice === undefined ? null : { id: choice.id, sortOrder: choice.sortOrder });
  };
  const selected = props.choices.some((choice) => choice.id === props.chosen?.id);
  return (
    <Select
      size="sm"
      value={selected ? props.chosen!.id : UNSET}
      onValueChange={choose}
      options={options}
      ariaLabel={props.label}
      testId={props.testId}
      className="w-44"
    />
  );
}

function ChoiceInputs({ row, field, scope, onChange }: FilterValueInputsProps) {
  const result = useAtomValue(searchChoicesAtom(scope, field));
  if (AsyncResult.isFailure(result)) {
    return (
      <span role="alert" data-testid="filter-choices-error" className="text-xs text-danger">
        {describeRpcFailure(result.cause)}
      </span>
    );
  }
  const choices = AsyncResult.isSuccess(result) ? result.value : [];
  const between = row.operator === "between";
  return (
    <>
      <ChoiceSelect
        label={`${field.displayName} ${between ? "from" : "value"}`}
        testId="filter-value-first"
        choices={choices}
        chosen={row.firstChoice}
        onChoose={(firstChoice) => onChange({ firstChoice })}
      />
      {between ? <Joiner text="to" /> : null}
      {between ? (
        <ChoiceSelect
          label={`${field.displayName} to`}
          testId="filter-value-second"
          choices={choices}
          chosen={row.secondChoice}
          onChoose={(secondChoice) => onChange({ secondChoice })}
        />
      ) : null}
    </>
  );
}

/** The value inputs a filter row's field and operator need, if any. */
export function FilterValueInputs(props: FilterValueInputsProps) {
  switch (props.field.dataType) {
    case "Boolean":
      return <BooleanInput {...props} />;
    case "Choice":
      return <ChoiceInputs {...props} />;
    default:
      return <TextInputs {...props} />;
  }
}
