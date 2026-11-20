import { parseTransferUtc } from "@task-tracker/core";
import type {
  ExportDocument,
  FieldChoice,
  FieldDefinition,
  Folder,
  ImportIndex,
  IssueList,
  ItemFieldValue,
  ItemLink,
  ItemType,
  PriorityLevel,
  Project,
  SavedSearch,
  StatusLevel,
  TodoItem,
  TransferIssue,
  TransferSummary,
} from "@task-tracker/core";

/** The rows an import reads from the database before planning. */
export interface ImportExisting {
  readonly itemTypes: readonly ItemType[];
  readonly priorityLevels: readonly PriorityLevel[];
  readonly statuses: readonly StatusLevel[];
  readonly fields: readonly FieldDefinition[];
  readonly choices: readonly FieldChoice[];
  /** Every project, deleted ones included. */
  readonly projects: readonly Project[];
  readonly globalSettings: ReadonlyMap<string, string>;
  readonly savedSearches: readonly SavedSearch[];
}

/** One project setting override to store. */
export interface ImportedSetting {
  readonly projectId: string;
  readonly key: string;
  readonly value: string;
}

/** Every row an import adds, in the order they must be inserted. */
export interface ImportPlan {
  readonly itemTypes: ItemType[];
  readonly priorityLevels: PriorityLevel[];
  readonly statuses: StatusLevel[];
  readonly projects: Project[];
  readonly settings: ImportedSetting[];
  readonly fields: FieldDefinition[];
  readonly choices: FieldChoice[];
  /** Folders and items with every parent before its children. */
  readonly folders: Folder[];
  readonly items: TodoItem[];
  readonly values: ItemFieldValue[];
  readonly links: ItemLink[];
  readonly savedSearches: SavedSearch[];
}

/** Which new or matched row each id or key in the file turned into. */
export class ImportMap {
  readonly itemTypes = new Map<string, string>();
  readonly priorityLevels = new Map<string, string>();
  readonly statuses = new Map<string, string>();
  readonly choices = new Map<string, string>();
  readonly recurrenceSeries = new Map<string, string>();
  readonly projects = new Map<string, string>();
  readonly folders = new Map<string, string>();
  readonly items = new Map<string, string>();
  /** Fields by trimmed source key, compared ignoring case. */
  readonly fields = new Map<string, FieldDefinition>();
  firstDoneStatusId: string | null = null;

  /** Every id a saved query can mention (types, priorities and choices) with its new id. */
  queryIds(): Map<string, string> {
    return new Map([...this.itemTypes, ...this.priorityLevels, ...this.choices]);
  }
}

/** What every import step shares: the document, its index, the plan so far and the clock. */
export interface ImportContext {
  readonly document: ExportDocument;
  readonly index: ImportIndex;
  readonly map: ImportMap;
  readonly issues: IssueList;
  readonly plan: ImportPlan;
  readonly now: Temporal.Instant;
  readonly newId: () => string;
}

/** A planned import, or the issues that stop it. */
export type ImportOutcome =
  | { readonly kind: "planned"; readonly plan: ImportPlan; readonly summary: TransferSummary }
  | { readonly kind: "refused"; readonly issues: readonly TransferIssue[] };

/** The positions of documents in sort-order order; equal sort orders keep file order. */
export function sortOrderPositions<T>(
  documents: readonly T[],
  sortOrderOf: (document: T) => number | null,
) {
  return documents
    .map((_document, position) => position)
    .toSorted(
      (left, right) => (sortOrderOf(documents[left]!) ?? 0) - (sortOrderOf(documents[right]!) ?? 0),
    );
}

/** The next sort order after existing rows, or 0 for an empty list. */
export function nextSortOrder(rows: ReadonlyArray<{ readonly sortOrder: number }>): number {
  return rows.length === 0 ? 0 : Math.max(...rows.map((row) => row.sortOrder)) + 1;
}

/** A row's timestamps from the file; a missing creation time is the import time, a missing update time the creation time. */
export function importTimestamps(
  created: string | null,
  updated: string | null,
  now: Temporal.Instant,
) {
  const createdAtUtc = parseTransferUtc(created) ?? now;
  return { createdAtUtc, updatedAtUtc: parseTransferUtc(updated) ?? createdAtUtc };
}
