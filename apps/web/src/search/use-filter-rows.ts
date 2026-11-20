import type { SearchableField } from "@task-tracker/contracts";
import { useCallback, useRef, useState } from "react";
import {
  createFilterRowDraft,
  evaluateFilterRow,
  type FilterRowDraft,
  isSameField,
} from "./filter-row-model.js";

type Field = typeof SearchableField.Type;

/** The current listing of a row's field, or undefined once the scope no longer offers it. */
export const currentField = (row: FilterRowDraft, fields: ReadonlyArray<Field>) =>
  row.field === null ? undefined : fields.find((field) => isSameField(field, row.field!));

function patchRow(
  rows: ReadonlyArray<FilterRowDraft>,
  rowId: string,
  next: (row: FilterRowDraft) => FilterRowDraft,
) {
  return rows.map((row) => (row.id === rowId ? next(row) : row));
}

/**
 * The filter builder's rows, evaluated against the fields in scope. Once a scope's
 * fields load, rows on fields that scope lacks are removed, while blank rows and
 * rows on fields still offered keep their values (§7.2). `fields` is null while
 * the scope's fields are loading.
 */
export function useFilterRows(fields: ReadonlyArray<Field> | null) {
  const [rows, setRows] = useState<ReadonlyArray<FilterRowDraft>>([]);
  const nextId = useRef(0);

  const add = useCallback(() => {
    nextId.current += 1;
    setRows((current) => [...current, createFilterRowDraft(`filter-${nextId.current}`)]);
  }, []);
  const chooseField = useCallback((rowId: string, field: Field) => {
    setRows((current) => patchRow(current, rowId, () => createFilterRowDraft(rowId, field)));
  }, []);
  const change = useCallback((rowId: string, patch: Partial<FilterRowDraft>) => {
    setRows((current) => patchRow(current, rowId, (row) => ({ ...row, ...patch })));
  }, []);
  const remove = useCallback((rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  }, []);
  /** Replaces every row with ones `build` makes from fresh IDs, as applying query text does. */
  const replace = useCallback(
    (build: (nextRowId: () => string) => ReadonlyArray<FilterRowDraft>) => {
      const nextRowId = () => {
        nextId.current += 1;
        return `filter-${nextId.current}`;
      };
      setRows(build(nextRowId));
    },
    [],
  );

  const offered =
    fields === null ? rows : rows.filter((row) => row.field === null || currentField(row, fields));
  if (offered.length !== rows.length) {
    setRows(offered);
  }
  const evaluations = offered.map((row) => evaluateFilterRow(row, currentField(row, fields ?? [])));
  return { rows: offered, evaluations, add, chooseField, change, remove, replace };
}
