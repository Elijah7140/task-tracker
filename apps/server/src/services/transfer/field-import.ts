import {
  listOf,
  nameKey,
  parseTransferDataType,
  QUERY_KEYWORDS,
  trimText,
  TRANSFER_NAME_MAX_LENGTH,
  uniqueImportedName,
  type ChoiceDocument,
  type FieldChoice,
  type FieldDataType,
  type FieldDefinition,
  type FieldDocument,
} from "@task-tracker/core";
import type { ImportContext, ImportExisting } from "./import-plan.js";

/** Keys every custom field must avoid: the built-in search columns and the syntax keywords. */
const RESERVED_KEYS = [
  "title",
  "ticket",
  "type",
  "priority",
  "due",
  "scheduled",
  "status",
  "completed",
  "link",
  "repeats",
  "reminder",
  ...QUERY_KEYWORDS,
  "__workflowstatus",
];

/** The first free key: the key itself, then `key-2`, `key-3`, ... shortened to fit. */
function uniqueKey(key: string, unavailable: ReadonlySet<string>): string {
  for (let suffix = 1; ; suffix++) {
    const ending = suffix === 1 ? "" : `-${suffix}`;
    const candidate = key.slice(0, TRANSFER_NAME_MAX_LENGTH - ending.length) + ending;
    if (!unavailable.has(nameKey(candidate))) {
      return candidate;
    }
  }
}

/**
 * Matches the file's global fields to existing ones by key ignoring case (another
 * data type is an issue) and plans the rest, along with every project field. Keys
 * stay when free; display names of active fields get " (imported)" when taken.
 * Choices of a matched field are matched by label and the missing ones added (§7.9).
 */
class FieldImport {
  readonly #fields: FieldDefinition[];
  readonly #choices: FieldChoice[];
  readonly #usedKeys: Set<string>;
  readonly #sourceKeys: Set<string>;

  constructor(
    private readonly context: ImportContext,
    existing: ImportExisting,
  ) {
    this.#fields = [...existing.fields];
    this.#choices = [...existing.choices];
    this.#usedKeys = new Set(
      [...existing.fields.map((field) => field.key), ...RESERVED_KEYS].map(nameKey),
    );
    const documents = listOf(context.document.fields);
    this.#sourceKeys = new Set(documents.map((field) => nameKey(trimText(field.key!))));
  }

  run(): void {
    const documents = listOf(this.context.document.fields);
    const positions = documents
      .map((_field, position) => position)
      .toSorted(
        (left, right) =>
          this.#rank(documents[left]!) - this.#rank(documents[right]!) || left - right,
      );
    for (const position of positions) {
      this.#importField(documents[position]!, `$.fields[${position}]`);
    }
  }

  #rank(field: FieldDocument): number {
    return (field.projectId === null ? 0 : 1) * 2 ** 40 + (field.sortOrder ?? 0);
  }

  #importField(document: FieldDocument, path: string): void {
    const type = parseTransferDataType(document.dataType)!;
    const projectId =
      document.projectId === null ? null : this.context.map.projects.get(document.projectId)!;
    const key = trimText(document.key!);
    const match = projectId === null ? this.#findGlobal(key) : undefined;
    if (match === undefined) {
      this.#createField(document, type, projectId);
    } else if (match.dataType !== type) {
      const message = `A field with the key '${match.key}' already exists with type ${match.dataType}.`;
      this.context.issues.add(`${path}.dataType`, message);
    } else {
      this.context.map.fields.set(nameKey(key), match);
      this.#matchChoices(document, match);
    }
  }

  #findGlobal(key: string): FieldDefinition | undefined {
    return this.#fields.find(
      (field) => field.projectId === null && nameKey(field.key) === nameKey(key),
    );
  }

  #createField(document: FieldDocument, dataType: FieldDataType, projectId: string | null): void {
    const sourceKey = trimText(document.key!);
    const unavailable = new Set([...this.#usedKeys, ...this.#sourceKeys]);
    unavailable.delete(nameKey(sourceKey));
    for (const used of this.#usedKeys) {
      unavailable.add(used);
    }
    const field: FieldDefinition = {
      id: this.context.newId(),
      key: uniqueKey(sourceKey, unavailable),
      displayName: this.#displayName(document, projectId),
      dataType,
      projectId,
      isArchived: document.isArchived === true,
      sortOrder: this.#sortOrder(document, projectId),
    };
    this.context.plan.fields.push(field);
    this.#fields.push(field);
    this.#usedKeys.add(nameKey(field.key));
    this.context.map.fields.set(nameKey(sourceKey), field);
    for (const choice of listOf(document.choices)) {
      this.#createChoice(field, choice, choice.sortOrder ?? 0);
    }
  }

  #displayName(document: FieldDocument, projectId: string | null): string {
    const name = trimText(document.displayName!);
    if (document.isArchived === true) {
      return name;
    }
    return uniqueImportedName(
      name,
      (candidate) => this.#isVisibleActiveName(candidate, projectId),
      TRANSFER_NAME_MAX_LENGTH,
    );
  }

  #isVisibleActiveName(name: string, projectId: string | null): boolean {
    return this.#fields.some(
      (field) =>
        !field.isArchived &&
        (field.projectId === null || projectId === null || field.projectId === projectId) &&
        nameKey(field.displayName) === nameKey(name),
    );
  }

  /** A project field keeps its exported position; a new global field goes after the existing ones. */
  #sortOrder(document: FieldDocument, projectId: string | null): number {
    if (projectId !== null) {
      return document.sortOrder ?? 0;
    }
    const orders = this.#fields
      .filter((field) => field.projectId === null)
      .map((field) => field.sortOrder);
    return orders.length === 0 ? 0 : Math.max(...orders) + 1;
  }

  #matchChoices(document: FieldDocument, field: FieldDefinition): void {
    for (const choice of listOf(document.choices)) {
      const label = choice.label === null ? null : trimText(choice.label);
      const existing = this.#choices.find(
        (row) =>
          row.fieldDefinitionId === field.id &&
          label !== null &&
          nameKey(row.label) === nameKey(label),
      );
      const matched = existing ?? this.#createChoice(field, choice, this.#nextChoiceOrder(field));
      this.context.map.choices.set(choice.id!, matched.id);
    }
  }

  #nextChoiceOrder(field: FieldDefinition): number {
    const orders = this.#choices
      .filter((row) => row.fieldDefinitionId === field.id)
      .map((row) => row.sortOrder);
    return orders.length === 0 ? 0 : Math.max(...orders) + 1;
  }

  #createChoice(field: FieldDefinition, document: ChoiceDocument, sortOrder: number): FieldChoice {
    const choice: FieldChoice = {
      id: this.context.newId(),
      fieldDefinitionId: field.id,
      label: trimText(document.label!),
      sortOrder,
      isArchived: document.isArchived === true,
    };
    this.context.plan.choices.push(choice);
    this.#choices.push(choice);
    this.context.map.choices.set(document.id!, choice.id);
    return choice;
  }
}

/** Plans the file's fields and choices (§7.9). */
export function importFields(context: ImportContext, existing: ImportExisting): void {
  new FieldImport(context, existing).run();
}
