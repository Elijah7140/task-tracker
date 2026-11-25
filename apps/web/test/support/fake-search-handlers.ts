import {
  type FolderProjection,
  type ItemQuery,
  type ItemSearchResult,
  type ProjectSummary,
  RuleViolation,
  type SearchableField,
  type SearchChoice,
  type SearchScope,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import { FAKE_LOOKUPS, type FakeItemNode } from "./fake-area-items.js";
import type { FakeCustomFields } from "./fake-custom-fields.js";
import type { FakeAreaState } from "./fake-item-operations.js";
import {
  foldText,
  matchesFilter,
  type FakeFilterContext,
  type FakeLink,
} from "./fake-search-filters.js";
import type { FakeStatuses } from "./fake-statuses.js";

type Summary = typeof ProjectSummary.Type;
type Folder = typeof FolderProjection.Type;
type Query = typeof ItemQuery.Type;
type Field = typeof SearchableField.Type;
type Choice = typeof SearchChoice.Type;
type Result = typeof ItemSearchResult.Type;
type Scope = typeof SearchScope.Type;
type Item = FakeItemNode["item"];

type Operator = Field["operators"][number];

/** The server's operator rule: links take Contains, priority and ordered types compare. */
function operatorsFor(key: string, dataType: Field["dataType"], builtIn: boolean): Array<Operator> {
  if (builtIn && key === "link") {
    return ["contains", "isEmpty", "isNotEmpty"];
  }
  const ordered = dataType === "Number" || dataType === "Date" || (builtIn && key === "priority");
  return [
    "equals",
    "notEquals",
    ...(dataType === "Text" ? (["contains"] as const) : []),
    ...(ordered ? (["greaterThan", "lessThan", "between"] as const) : []),
    "isEmpty",
    "isNotEmpty",
  ];
}

const builtIn = (key: string, displayName: string, dataType: Field["dataType"]): Field => ({
  key,
  displayName,
  dataType,
  fieldDefinitionId: null,
  operators: operatorsFor(key, dataType, true),
});

/** The server's built-in search fields in registry order. */
const BUILT_IN_FIELDS: ReadonlyArray<Field> = [
  builtIn("title", "Title", "Text"),
  builtIn("ticket", "Ticket Number", "Text"),
  builtIn("type", "Type", "Choice"),
  builtIn("priority", "Priority", "Choice"),
  builtIn("due", "Due Date", "Date"),
  builtIn("status", "Status", "Text"),
  builtIn("completed", "Completed", "Boolean"),
  builtIn("link", "Links", "Text"),
];

/**
 * Search failures and link fixtures for {@link FakeProjectStore}. Types and priorities
 * come from the lookups seeded items and area snapshots use.
 */
export class FakeSearch {
  /** When set, `SearchItems` fails with this rule message. */
  searchFailure: string | null = null;
  /** When set, `ListSearchFields` fails with this rule message. */
  fieldsFailure: string | null = null;
  /** Links keyed by item ID, for the built-in `link` field. */
  readonly linksByItemId = new Map<string, ReadonlyArray<FakeLink>>();
  /** Overrides the requested page size, to show the more-results note with few items. */
  pageSize: number | null = null;
  /** Every query `SearchItems` received, in order. */
  readonly queries: Array<Query> = [];
}

/** The fake store state that search reads. */
export interface SearchStore {
  readonly summaries: ReadonlyArray<Summary>;
  readonly folders: ReadonlyArray<Folder>;
  readonly allAreas: () => ReadonlyArray<FakeAreaState>;
  readonly statuses: FakeStatuses;
  readonly customFields: FakeCustomFields;
  readonly search: FakeSearch;
  readonly record: (tag: string) => Effect.Effect<unknown>;
}

function allItems(store: SearchStore): Array<Item> {
  const visit = (nodes: ReadonlyArray<FakeItemNode>): Array<Item> =>
    nodes.flatMap((node) => [node.item, ...visit(node.children)]);
  return store.allAreas().flatMap((area) => visit(area.nodes));
}

/** The server's search fields in `scope`, in registry order. */
export function listFields(store: SearchStore, scope: Scope): ReadonlyArray<Field> {
  const projectId = scope.kind === "allProjects" ? null : scope.projectId;
  const projectOrder = new Map(
    store.summaries.map(({ project }) => [project.id, project.sortOrder]),
  );
  const order = (owner: string | null) => (owner === null ? -1 : (projectOrder.get(owner) ?? 0));
  const custom = store.customFields.fields
    .filter((field) => !field.isArchived)
    .filter((field) => field.projectId === null || projectOrder.has(field.projectId))
    .filter(
      (field) => projectId === null || field.projectId === null || field.projectId === projectId,
    )
    .toSorted(
      (left, right) =>
        order(left.projectId) - order(right.projectId) || left.sortOrder - right.sortOrder,
    );
  const toField = ({ key, displayName, dataType, id }: (typeof custom)[number]): Field => ({
    key,
    displayName,
    dataType,
    fieldDefinitionId: id,
    operators: operatorsFor(key, dataType, false),
  });
  return [...BUILT_IN_FIELDS, ...custom.map(toField)];
}

function toChoice(
  id: string,
  label: string,
  sortOrder: number,
  extra: Partial<Choice> = {},
): Choice {
  return { id, label, sortOrder, name: null, number: null, ...extra };
}

/** The active choices of a choice field in display order. */
export function listChoices(store: SearchStore, field: Field): ReadonlyArray<Choice> {
  const { priorityLevels } = FAKE_LOOKUPS;
  const active = <Row extends { readonly isArchived: boolean; readonly sortOrder: number }>(
    rows: ReadonlyArray<Row>,
  ) =>
    rows
      .filter((row) => !row.isArchived)
      .toSorted((left, right) => left.sortOrder - right.sortOrder);
  if (field.fieldDefinitionId !== null) {
    const choices = active(store.customFields.choicesOf(field.fieldDefinitionId));
    return choices.map((row) => toChoice(row.id, row.label, row.sortOrder));
  }
  return active(priorityLevels).map((row) =>
    toChoice(row.id, row.label, row.sortOrder, { name: row.name, number: row.number }),
  );
}

function folderPath(store: SearchStore, projectName: string, folderId: string | null) {
  const byId = new Map(store.folders.map((folder) => [folder.id, folder]));
  const names: Array<string> = [];
  for (let id = folderId; id !== null; id = byId.get(id)?.parentFolderId ?? null) {
    names.unshift(byId.get(id)?.name ?? "");
  }
  return [projectName, ...names];
}

function descendantFolders(store: SearchStore, folderId: string): Set<string> {
  const found = new Set([folderId]);
  for (const folder of store.folders) {
    if (folder.parentFolderId !== null && found.has(folder.parentFolderId)) {
      found.add(folder.id);
    }
  }
  return found;
}

function inScope(store: SearchStore, item: Item, scope: Scope): boolean {
  if (scope.kind === "allProjects") {
    return true;
  }
  if (item.projectId !== scope.projectId || scope.kind === "project") {
    return item.projectId === scope.projectId;
  }
  if (scope.folderId === null) {
    return scope.includeSubfolders || item.folderId === null;
  }
  if (!scope.includeSubfolders) {
    return item.folderId === scope.folderId;
  }
  return item.folderId !== null && descendantFolders(store, scope.folderId).has(item.folderId);
}

function filterContext(store: SearchStore): FakeFilterContext {
  const { priorityLevels } = FAKE_LOOKUPS;
  return {
    statusName: (id) => store.statuses.rows.find((row) => row.id === id)?.name ?? null,
    priorityRank: (id) => priorityLevels.find((row) => row.id === id)?.sortOrder,
    customValue: (itemId, fieldId) => {
      const stored = store.customFields
        .valuesFor(itemId)
        .find((row) => row.fieldDefinitionId === fieldId);
      return stored === undefined
        ? null
        : (stored.textValue ??
            stored.numberValue ??
            stored.dateValue ??
            stored.boolValue ??
            stored.choiceId);
    },
    links: (itemId) => store.search.linksByItemId.get(itemId) ?? [],
  };
}

function matchesQuery(store: SearchStore, item: Item, query: Query, fields: ReadonlyArray<Field>) {
  const terms = (query.text ?? "").split(/\s+/).filter((term) => /[\p{L}\p{N}]/u.test(term));
  const corpus = foldText(
    `${item.title} ${item.description ?? ""} ${item.notes ?? ""} ${item.ticketNumber ?? ""}`,
  );
  const context = filterContext(store);
  return (
    inScope(store, item, query.scope) &&
    (query.includeCompleted || item.completedAtUtc === null) &&
    terms.every((term) => corpus.includes(foldText(term))) &&
    query.filters.every((filter) => {
      const field = fields.find((candidate) => candidate.key === filter.fieldKey);
      return field !== undefined && matchesFilter(item, filter, field, context);
    })
  );
}

function toResult(store: SearchStore, item: Item, project: Summary["project"]): Result {
  const { priorityLevels } = FAKE_LOOKUPS;
  return {
    itemId: item.id,
    projectId: item.projectId,
    projectName: project.name,
    folderId: item.folderId,
    parentItemId: item.parentItemId,
    title: item.title,
    ticketNumber: item.ticketNumber,
    priorityLevelId: item.priorityLevelId,
    statusId: item.statusId,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    isCompleted: item.completedAtUtc !== null,
    location: folderPath(store, project.name, item.folderId),
    priorityLabel: priorityLevels.find((row) => row.id === item.priorityLevelId)?.label ?? null,
    statusName: store.statuses.rows.find((row) => row.id === item.statusId)?.name ?? null,
  };
}

/** Runs a query over the fake's items in the server's project, title and ID order. */
function search(store: SearchStore, query: Query, limit: number) {
  const fields = listFields(store, query.scope);
  const projects = new Map(store.summaries.map(({ project }) => [project.id, project]));
  const hits = allItems(store)
    .filter((item) => projects.has(item.projectId) && matchesQuery(store, item, query, fields))
    .map((item) => toResult(store, item, projects.get(item.projectId)!))
    .toSorted(
      (left, right) =>
        projects.get(left.projectId)!.sortOrder - projects.get(right.projectId)!.sortOrder ||
        foldText(left.title).localeCompare(foldText(right.title)) ||
        left.itemId.localeCompare(right.itemId),
    );
  return { items: hits.slice(0, limit), hasMore: hits.length > limit };
}

const failWith = (message: string | null) =>
  message === null ? Effect.void : Effect.fail(new RuleViolation({ message }));

/** Fake handlers for scoped search that mirror the server's rules and ordering (§7.2). */
export function searchHandlers(store: SearchStore) {
  return {
    ListSearchFields: ({ scope }: { readonly scope: Scope }) =>
      store
        .record("ListSearchFields")
        .pipe(
          Effect.andThen(failWith(store.search.fieldsFailure)),
          Effect.as(listFields(store, scope)),
        ),
    ListSearchChoices: ({
      scope,
      fieldKey,
    }: {
      readonly scope: Scope;
      readonly fieldKey: string;
    }) =>
      store.record("ListSearchChoices").pipe(
        Effect.andThen(() => {
          const field = listFields(store, scope).find((candidate) => candidate.key === fieldKey);
          return field === undefined
            ? failWith(`Unknown search field '${fieldKey}'.`).pipe(Effect.as([]))
            : Effect.succeed(listChoices(store, field));
        }),
      ),
    SearchItems: ({
      query,
      limit,
    }: {
      readonly query: Query;
      readonly limit?: number | undefined;
    }) =>
      store.record("SearchItems").pipe(
        Effect.tap(() => Effect.sync(() => store.search.queries.push(query))),
        Effect.andThen(failWith(store.search.searchFailure)),
        Effect.map(() => search(store, query, store.search.pageSize ?? limit ?? 200)),
      ),
    LocateSearchItem: ({ itemId }: { readonly itemId: string }) =>
      store.record("LocateSearchItem").pipe(
        Effect.as(allItems(store).find((item) => item.id === itemId.toUpperCase()) ?? null),
        Effect.map((item) =>
          item === null
            ? null
            : { itemId: item.id, projectId: item.projectId, folderId: item.folderId },
        ),
      ),
  };
}
