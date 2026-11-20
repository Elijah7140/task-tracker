import { nameKey } from "../../metadata/names.js";
import type { IssueList } from "../transfer-issue.js";
import type { ChoiceDocument, DocumentList, FieldDocument } from "./export-document.js";
import { listOf } from "./export-document.js";
import {
  checkId,
  checkName,
  DATA_TYPE_NAMES,
  guidText,
  NAME_MAX_LENGTH,
  parseDataType,
  trimText,
} from "./import-checks.js";
import type { ImportIndex } from "./import-index.js";
import { elementPath } from "./json-path.js";

/** Checks the custom field definitions and choices of an import document (§7.1). */
export class FieldDocumentValidator {
  readonly #fieldIds = new Set<string>();
  readonly #choiceIds = new Set<string>();
  readonly #keys = new Set<string>();

  constructor(
    private readonly index: ImportIndex,
    private readonly issues: IssueList,
  ) {}

  validate(fields: DocumentList<FieldDocument>): void {
    const list = listOf(fields);
    list.forEach((field, position) =>
      this.#validateField(field, elementPath("$.fields", position)),
    );
    this.#checkActiveNames(list);
  }

  #validateField(field: FieldDocument, path: string): void {
    checkId(field.id, `${path}.id`, this.#fieldIds, this.issues);
    this.#checkKey(field.key, `${path}.key`);
    checkName(field.displayName, NAME_MAX_LENGTH, `${path}.displayName`, this.issues);
    if (field.projectId !== null && !this.index.projectIds.has(field.projectId)) {
      this.issues.add(
        `${path}.projectId`,
        `The project ${guidText(field.projectId)} is not in this file.`,
      );
    }
    const isChoiceField = this.#checkDataType(field.dataType, `${path}.dataType`);
    this.#validateChoices(field, isChoiceField, path);
  }

  #checkKey(key: string | null, path: string): void {
    if (!checkName(key, NAME_MAX_LENGTH, path, this.issues)) {
      return;
    }
    const trimmed = trimText(key);
    if (this.#keys.has(nameKey(trimmed))) {
      this.issues.add(path, `The key '${trimmed}' is used more than once.`);
    }
    this.#keys.add(nameKey(trimmed));
  }

  /** Checks the data type name and returns true when it names the Choice type. */
  #checkDataType(dataType: string | null, path: string): boolean {
    const type = parseDataType(dataType);
    if (type === null) {
      this.issues.add(path, `The data type must be one of: ${DATA_TYPE_NAMES}.`);
      return false;
    }
    return type === "Choice";
  }

  #validateChoices(field: FieldDocument, isChoiceField: boolean, path: string): void {
    const choices = listOf(field.choices);
    if (!isChoiceField && choices.length > 0) {
      this.issues.add(`${path}.choices`, "Only a Choice field can have choices.");
      return;
    }
    const activeLabels = new Set<string>();
    choices.forEach((choice, position) =>
      this.#validateChoice(choice, elementPath(`${path}.choices`, position), activeLabels),
    );
  }

  #validateChoice(choice: ChoiceDocument, path: string, activeLabels: Set<string>): void {
    checkId(choice.id, `${path}.id`, this.#choiceIds, this.issues);
    if (!checkName(choice.label, NAME_MAX_LENGTH, `${path}.label`, this.issues)) {
      return;
    }
    if (choice.isArchived === true) {
      return;
    }
    const label = trimText(choice.label);
    if (activeLabels.has(nameKey(label))) {
      const message = `The label '${label}' is used by more than one active choice.`;
      this.issues.add(`${path}.label`, message);
    }
    activeLabels.add(nameKey(label));
  }

  /** Active field names must be unique among the fields visible together (global plus one project). */
  #checkActiveNames(fields: readonly FieldDocument[]): void {
    const globalNames = new Set<string>();
    const projectNames = new Set<string>();
    fields.forEach((field, position) => {
      const name = activeName(field);
      if (field.projectId === null && name !== null) {
        this.#reserve(globalNames, nameKey(name), false, position, name);
      }
    });
    fields.forEach((field, position) => {
      const name = activeName(field);
      if (field.projectId !== null && name !== null) {
        const key = `${field.projectId}|${name.toUpperCase()}`;
        this.#reserve(projectNames, key, globalNames.has(nameKey(name)), position, name);
      }
    });
  }

  #reserve(names: Set<string>, key: string, clash: boolean, position: number, name: string): void {
    if (clash || names.has(key)) {
      const path = `${elementPath("$.fields", position)}.displayName`;
      this.issues.add(path, `The name '${name}' is already used by another active field.`);
    }
    names.add(key);
  }
}

function activeName(field: FieldDocument): string | null {
  const name = field.displayName === null ? "" : trimText(field.displayName);
  return field.isArchived === true || name === "" ? null : name;
}
