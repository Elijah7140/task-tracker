import { nameKey } from "../../metadata/names.js";
import type {
  ChoiceDocument,
  ExportDocument,
  FieldDocument,
  FieldValueDocument,
  ItemDocument,
  LookupDocument,
} from "./export-document.js";
import { listOf } from "./export-document.js";
import { isBlank, sameText, trimText } from "./import-checks.js";

/** Lookup tables over an import document, shared by the validators and the importer. */
export class ImportIndex {
  readonly projectIds = new Set<string>();
  readonly #fieldsByKey = new Map<string, FieldDocument>();
  readonly #projectOfFolder = new Map<string, string>();

  constructor(private readonly document: ExportDocument) {
    for (const field of listOf(document.fields)) {
      if (!isBlank(field.key)) {
        const key = nameKey(trimText(field.key!));
        if (!this.#fieldsByKey.has(key)) {
          this.#fieldsByKey.set(key, field);
        }
      }
    }
    this.#indexProjects();
  }

  /** The field definition with this key (ignoring case and surrounding whitespace), or undefined. */
  findField(key: string | null): FieldDocument | undefined {
    return key === null ? undefined : this.#fieldsByKey.get(nameKey(trimText(key)));
  }

  /** The project a folder belongs to, or undefined when the folder is not in the document. */
  projectOfFolder(folderId: string): string | undefined {
    return this.#projectOfFolder.get(folderId);
  }

  /** The priority level an item refers to: by id when it has one, otherwise by name. */
  findPriority(item: ItemDocument): LookupDocument | undefined {
    return findLookup(listOf(this.document.priorityLevels), item.priorityLevelId, item.priority);
  }

  /** The status with this id in the document, or undefined. */
  findStatus(id: string): LookupDocument | undefined {
    return listOf(this.document.statuses).find((status) => status.id === id);
  }

  /** The choice a value refers to: by id when it has one, otherwise by label, active choices first. */
  findChoice(field: FieldDocument, value: FieldValueDocument): ChoiceDocument | undefined {
    const choices = listOf(field.choices);
    if (value.choiceId !== null) {
      return choices.find((choice) => choice.id === value.choiceId);
    }
    const matching = choices.filter((choice) => sameTrimmed(choice.label, value.choiceLabel));
    return matching.find((choice) => choice.isArchived !== true) ?? matching[0];
  }

  #indexProjects(): void {
    for (const project of listOf(this.document.projects)) {
      if (project.id === null) {
        continue;
      }
      this.projectIds.add(project.id);
      for (const folder of listOf(project.folders)) {
        if (folder.id !== null && !this.#projectOfFolder.has(folder.id)) {
          this.#projectOfFolder.set(folder.id, project.id);
        }
      }
    }
  }
}

/** Null-safe comparison of two trimmed texts ignoring case; two nulls are equal, like .NET. */
function sameTrimmed(left: string | null, right: string | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return sameText(trimText(left), trimText(right));
}

function findLookup(
  lookups: readonly LookupDocument[],
  id: string | null,
  name: string | null,
): LookupDocument | undefined {
  if (id !== null) {
    return lookups.find((lookup) => lookup.id === id);
  }
  return lookups.find((lookup) => sameTrimmed(lookup.name, name));
}
