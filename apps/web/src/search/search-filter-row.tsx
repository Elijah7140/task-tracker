import type { SearchableField, SearchScope } from "@task-tracker/contracts";
import { X } from "lucide-react";
import { Button } from "../ui/button.js";
import { Select } from "../ui/select.js";
import { FilterValueInputs } from "./filter-value-inputs.js";
import {
  type FilterRowDraft,
  type FilterRowEvaluation,
  isPresenceOperator,
  operatorLabelFor,
} from "./filter-row-model.js";

type Field = typeof SearchableField.Type;

const UNSET = "__unset__";

/** Props for {@link SearchFilterRow}. */
export interface SearchFilterRowProps {
  readonly row: FilterRowDraft;
  readonly fields: ReadonlyArray<Field>;
  /** The row's field as the scope lists it now, or undefined for a blank row. */
  readonly field: Field | undefined;
  readonly scope: typeof SearchScope.Type;
  readonly evaluation: FilterRowEvaluation;
  readonly onChooseField: (rowId: string, field: Field) => void;
  readonly onChange: (rowId: string, patch: Partial<FilterRowDraft>) => void;
  readonly onRemove: (rowId: string) => void;
}

function FieldSelect({ row, fields, onChooseField }: SearchFilterRowProps) {
  const options = [
    { value: UNSET, label: "Choose field…" },
    ...fields.map((field) => ({ value: field.key, label: field.displayName })),
  ];
  const choose = (key: string) => {
    const field = fields.find((candidate) => candidate.key === key);
    if (field !== undefined) {
      onChooseField(row.id, field);
    }
  };
  return (
    <Select
      size="sm"
      value={row.field?.key ?? UNSET}
      onValueChange={choose}
      options={options}
      ariaLabel="Filter field"
      testId="filter-field"
      className="w-44"
    />
  );
}

function OperatorSelect({
  row,
  field,
  onChange,
}: SearchFilterRowProps & { readonly field: Field }) {
  const options = field.operators.map((operator) => ({
    value: operator,
    label: operatorLabelFor(field, operator),
  }));
  return (
    <Select
      size="sm"
      value={row.operator ?? field.operators[0]!}
      onValueChange={(operator) => onChange(row.id, { operator })}
      options={options}
      ariaLabel="Filter operator"
      testId="filter-operator"
      className="w-48"
    />
  );
}

/** One field condition in the Search filter builder, with its inline value message. */
export function SearchFilterRow(props: SearchFilterRowProps) {
  const { row, field, scope, evaluation, onChange, onRemove } = props;
  return (
    <div
      role="group"
      aria-label="Filter"
      data-testid="search-filter-row"
      className="flex flex-col gap-1 rounded-control border border-line bg-surface px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FieldSelect {...props} />
        {field === undefined ? null : <OperatorSelect {...props} field={field} />}
        {field === undefined || isPresenceOperator(row.operator) ? null : (
          <FilterValueInputs
            row={row}
            field={field}
            scope={scope}
            onChange={(patch) => onChange(row.id, patch)}
          />
        )}
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-7"
          aria-label="Remove filter"
          data-testid="filter-remove"
          onClick={() => onRemove(row.id)}
        >
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      {evaluation.kind === "invalid" ? (
        <p data-testid="filter-error" className="text-xs text-danger">
          {evaluation.error}
        </p>
      ) : null}
    </div>
  );
}
