import type { FieldDataType } from "../../fields/field-data-type.js";
import { nameKey } from "../../metadata/names.js";
import { parseTransferDate } from "../transfer-time-format.js";
import type { IssueList } from "../transfer-issue.js";
import type { FieldDocument, FieldValueDocument } from "./export-document.js";
import { isBlank, parseDataType, trimText } from "./import-checks.js";
import type { ImportIndex } from "./import-index.js";
import { elementPath } from "./json-path.js";

function countValues(value: FieldValueDocument): number {
  const present = [value.text, value.number, value.date, value.boolean];
  const choice = value.choiceId !== null || value.choiceLabel !== null;
  return present.filter((part) => part !== null).length + (choice ? 1 : 0);
}

function matchesType(type: FieldDataType, value: FieldValueDocument): boolean {
  switch (type) {
    case "Text":
      return value.text !== null;
    case "Number":
      return value.number !== null;
    case "Date":
      return value.date !== null;
    case "Boolean":
      return value.boolean !== null;
    case "Choice":
      return value.choiceId !== null || value.choiceLabel !== null;
  }
}

/** Checks the custom values of one item against the field definitions in the file (§7.1). */
export class ItemValueValidator {
  constructor(
    private readonly index: ImportIndex,
    private readonly issues: IssueList,
  ) {}

  validate(values: readonly FieldValueDocument[], projectId: string | null, path: string): void {
    const usedKeys = new Set<string>();
    values.forEach((value, position) =>
      this.#validateValue(value, projectId, elementPath(path, position), usedKeys),
    );
  }

  #validateValue(
    value: FieldValueDocument,
    projectId: string | null,
    path: string,
    used: Set<string>,
  ) {
    const field = this.index.findField(value.fieldKey);
    const key = value.fieldKey;
    if (field === undefined || key === null) {
      this.issues.add(`${path}.fieldKey`, `The field '${key ?? ""}' is not defined in this file.`);
      return;
    }
    if (used.has(nameKey(trimText(key)))) {
      this.issues.add(
        `${path}.fieldKey`,
        `The field '${key}' has more than one value on this item.`,
      );
    }
    used.add(nameKey(trimText(key)));
    if (field.projectId !== null && field.projectId !== projectId) {
      this.issues.add(`${path}.fieldKey`, `The field '${key}' belongs to another project.`);
    }
    this.#checkColumns(field, value, path);
  }

  #checkColumns(field: FieldDocument, value: FieldValueDocument, path: string): void {
    const type = parseDataType(field.dataType);
    if (type === null) {
      return;
    }
    if (countValues(value) !== 1) {
      this.issues.add(path, "Exactly one value is required.");
      return;
    }
    if (!matchesType(type, value)) {
      this.issues.add(path, `The value does not match the field type ${type}.`);
      return;
    }
    this.#checkContent(field, type, value, path);
  }

  #checkContent(
    field: FieldDocument,
    type: FieldDataType,
    value: FieldValueDocument,
    path: string,
  ) {
    if (type === "Text" && isBlank(value.text)) {
      this.issues.add(`${path}.text`, "Blank text means no value; leave the value out instead.");
    }
    if (type === "Number" && !Number.isFinite(value.number)) {
      this.issues.add(`${path}.number`, "The number must be finite.");
    }
    if (type === "Date" && parseTransferDate(value.date) === null) {
      this.issues.add(`${path}.date`, "Expected a date such as 2026-11-13.");
    }
    if (type === "Choice" && this.index.findChoice(field, value) === undefined) {
      const message = `The choice is not one of the options of the field '${field.key ?? ""}'.`;
      this.issues.add(path, message);
    }
  }
}
