import type { FieldDefinition } from "../../fields/field-definition.js";
import type { FieldValueInput } from "../../fields/field-value-input.js";
import { nameKey, trimMetadataText as trim } from "../../metadata/names.js";
import { parseTransferDate } from "../transfer-time-format.js";
import { unprotectCsvCell } from "./csv-cells.js";
import { csvFieldHeader } from "./csv-columns.js";
import type { CsvHeader } from "./csv-header.js";
import type { CsvImportContext } from "./csv-import-context.js";
import { parseCsvNumber } from "./csv-number.js";
import type { CsvRecord } from "./csv-parser.js";
import { parseCsvYesNo } from "./csv-yes-no.js";

type Fail = (column: string, message: string) => void;

/** Reads one non-blank cell as a value of the field's type, or records why it can't. */
function readValue(
  field: FieldDefinition,
  text: string,
  context: CsvImportContext,
  fail: (message: string) => void,
): FieldValueInput | null {
  const fieldDefinitionId = field.id;
  const checked = <T>(value: T | null, message: string) => {
    if (value === null) {
      fail(message);
    }
    return value;
  };
  switch (field.dataType) {
    case "Text":
      return { fieldDefinitionId, textValue: text };
    case "Number": {
      const message = `'${text}' is not a number; use a dot for decimals, for example 2.5.`;
      const numberValue = checked(parseCsvNumber(text), message);
      return numberValue === null ? null : { fieldDefinitionId, numberValue };
    }
    case "Date": {
      const dateValue = checked(parseTransferDate(text), "Expected a date such as 2026-11-13.");
      return dateValue === null ? null : { fieldDefinitionId, dateValue };
    }
    case "Boolean": {
      const boolValue = checked(parseCsvYesNo(text), "Expected yes or no.");
      return boolValue === null ? null : { fieldDefinitionId, boolValue };
    }
    case "Choice":
      return readChoice(field, text, context, fail);
  }
}

function readChoice(
  field: FieldDefinition,
  text: string,
  context: CsvImportContext,
  fail: (message: string) => void,
): FieldValueInput | null {
  const choices = context.choices.filter(
    (choice) => choice.fieldDefinitionId === field.id && !choice.isArchived,
  );
  const match = choices.find((choice) => nameKey(choice.label) === nameKey(text));
  if (match === undefined) {
    const labels = choices.map((choice) => choice.label).join(", ");
    fail(`'${text}' is not one of the choices: ${labels}.`);
    return null;
  }
  return { fieldDefinitionId: field.id, choiceId: match.id };
}

/**
 * Reads a record's custom-field cells (§7.1): a blank cell is no value, and each
 * other cell must fit its field's type. Problems name the field's column header.
 */
export function readCsvFieldValues(
  header: CsvHeader,
  context: CsvImportContext,
  record: CsvRecord,
  fail: Fail,
): FieldValueInput[] {
  return header.fieldColumns.flatMap(({ index, field }) => {
    const cell = index < record.cells.length ? record.cells[index]! : "";
    const text = trim(unprotectCsvCell(cell));
    const failField = (message: string) => fail(csvFieldHeader(field.displayName), message);
    const value = text.length === 0 ? null : readValue(field, text, context, failField);
    return value === null ? [] : [value];
  });
}
