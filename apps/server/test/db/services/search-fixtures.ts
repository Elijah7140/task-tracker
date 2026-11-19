import type {
  FieldFilter,
  FilterOperator,
  FilterValue,
  ItemEdit,
  ItemQuery,
  ItemSearchResults,
  SearchScope,
} from "@task-tracker/core";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { FieldService } from "../../../src/services/field-service.js";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { LookupService } from "../../../src/services/lookup-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { SearchService } from "../../../src/services/search-service.js";
import { TrashService } from "../../../src/services/trash-service.js";
import { withSchema } from "../store.js";

const services = Effect.gen(function* () {
  return {
    projects: yield* ProjectService,
    folders: yield* FolderService,
    items: yield* ItemService,
    fields: yield* FieldService,
    lookups: yield* LookupService,
    trash: yield* TrashService,
    search: yield* SearchService,
    sql: yield* SqlClient.SqlClient,
  };
}).pipe(
  Effect.provide(ProjectService.layer("UTC")),
  Effect.provide(FolderService.layer),
  Effect.provide(ItemService.layer("UTC")),
  Effect.provide(FieldService.layer),
  Effect.provide(LookupService.layer),
  Effect.provide(TrashService.layer),
  Effect.provide(SearchService.layer),
);

/** The application services a search test seeds data with, on one fresh database. */
export type SearchServices = Effect.Success<typeof services>;

/** Runs `body` against freshly migrated in-memory SQLite. */
export const withSearchServices = <A, E>(
  body: (svc: SearchServices) => Effect.Effect<A, E, SqlClient.SqlClient>,
) => withSchema(Effect.flatMap(services, body));

/** An item edit that sets only the title plus `overrides`. */
export function editFields(title: string, overrides: Partial<ItemEdit> = {}): ItemEdit {
  return {
    title,
    description: null,
    ticketNumber: null,
    itemTypeId: null,
    priorityLevelId: null,
    dueDate: null,
    dueTime: null,
    scheduledStart: null,
    scheduledEnd: null,
    ...overrides,
  };
}

/** A query across all projects including completed items unless `options` says otherwise. */
export function query(
  filters: ReadonlyArray<FieldFilter>,
  options: { scope?: SearchScope; text?: string | null; includeCompleted?: boolean } = {},
): ItemQuery {
  return {
    scope: options.scope ?? { kind: "allProjects" },
    text: options.text ?? null,
    filters,
    includeCompleted: options.includeCompleted ?? true,
  };
}

/** One filter on `fieldKey`. */
export function filter(
  fieldKey: string,
  operator: FilterOperator,
  value: FilterValue | null = null,
): FieldFilter {
  return { fieldKey, operator, value };
}

export const text = (value: string): FilterValue => ({ kind: "text", value });
export const date = (value: string): FilterValue => ({ kind: "date", value });
export const number = (value: number): FilterValue => ({ kind: "number", value });
export const bool = (value: boolean): FilterValue => ({ kind: "boolean", value });
export const choice = (id: string): FilterValue => ({ kind: "choice", id });

/** Result titles in ordinal order, for assertions that ignore result order. */
export const sortedTitles = (results: ItemSearchResults) =>
  results.items.map((item) => item.title).toSorted();

/** Result titles in result order. */
export const titles = (results: ItemSearchResults) => results.items.map((item) => item.title);

const day = (text: string) => Temporal.PlainDate.from(text);

/**
 * Seeds the legacy filter matrix: completed Alpha and open Beta carry every built-in
 * and custom value, and Gamma carries none.
 */
export const seedFilterMatrix = Effect.fnUntraced(function* (svc: SearchServices) {
  const project = yield* svc.projects.create("Matrix");
  const [typeA, typeB] = yield* svc.lookups.itemTypes.list();
  const [priorityA, priorityB] = yield* svc.lookups.priorityLevels.list();
  const note = yield* svc.fields.create("Note", "Text", null);
  const estimate = yield* svc.fields.create("Estimate", "Number", null);
  const reviewed = yield* svc.fields.create("Reviewed", "Date", null);
  const approved = yield* svc.fields.create("Approved", "Boolean", null);
  const category = yield* svc.fields.create("Category", "Choice", null);
  const choiceA = yield* svc.fields.addChoice(category.id, "A");
  const choiceB = yield* svc.fields.addChoice(category.id, "B");
  const alpha = yield* svc.items.create(project.id, null, null, "Alpha");
  const beta = yield* svc.items.create(project.id, null, null, "Beta");
  yield* svc.items.create(project.id, null, null, "Gamma");
  yield* svc.items.edit(
    alpha.id,
    editFields("Alpha", {
      ticketNumber: "JIRA-1234",
      itemTypeId: typeA!.id,
      priorityLevelId: priorityA!.id,
      dueDate: day("2026-11-20"),
      scheduledStart: Temporal.PlainDateTime.from("2026-11-21T10:00:00"),
    }),
    [
      { fieldDefinitionId: note.id, textValue: "red" },
      { fieldDefinitionId: estimate.id, numberValue: 3.5 },
      { fieldDefinitionId: reviewed.id, dateValue: day("2026-11-22") },
      { fieldDefinitionId: approved.id, boolValue: true },
      { fieldDefinitionId: category.id, choiceId: choiceA.id },
    ],
  );
  yield* svc.items.edit(
    beta.id,
    editFields("Beta", {
      ticketNumber: "OPS-9",
      itemTypeId: typeB!.id,
      priorityLevelId: priorityB!.id,
      dueDate: day("2026-11-30"),
      scheduledStart: Temporal.PlainDateTime.from("2026-12-01T10:00:00"),
    }),
    [
      { fieldDefinitionId: note.id, textValue: "blue" },
      { fieldDefinitionId: estimate.id, numberValue: 8.5 },
      { fieldDefinitionId: reviewed.id, dateValue: day("2026-12-02") },
      { fieldDefinitionId: approved.id, boolValue: false },
      { fieldDefinitionId: category.id, choiceId: choiceB.id },
    ],
  );
  yield* svc.items.setCompleted(project.id, null, alpha.id, true);
  return {
    note,
    estimate,
    reviewed,
    approved,
    category,
    choiceA,
    typeA: typeA!,
    priorityA: priorityA!,
    priorityB: priorityB!,
  };
});

/**
 * Seeds the legacy area matrix: First holds root, folder, nested, sub-item, completed,
 * deleted and deleted-folder rows, and Second holds one item.
 */
export const seedAreaMatrix = Effect.fnUntraced(function* (svc: SearchServices) {
  const first = yield* svc.projects.create("First");
  const second = yield* svc.projects.create("Second");
  const main = yield* svc.folders.create(first.id, null, "Main");
  const nested = yield* svc.folders.create(first.id, main.id, "Nested");
  const sibling = yield* svc.folders.create(first.id, null, "Sibling");
  const deletedFolder = yield* svc.folders.create(first.id, null, "Deleted");
  yield* svc.items.create(first.id, null, null, "Root");
  const complete = yield* svc.items.create(first.id, null, null, "Complete");
  yield* svc.items.setCompleted(first.id, null, complete.id, true);
  yield* svc.items.create(first.id, main.id, null, "Folder");
  yield* svc.items.create(first.id, nested.id, null, "Child");
  const parent = yield* svc.items.create(first.id, nested.id, null, "Parent");
  yield* svc.items.create(first.id, nested.id, parent.id, "Subitem");
  yield* svc.items.create(first.id, sibling.id, null, "Sibling");
  yield* svc.items.create(first.id, deletedFolder.id, null, "Hidden in folder");
  yield* svc.folders.delete(first.id, deletedFolder.id);
  const deleted = yield* svc.items.create(first.id, null, null, "Deleted item");
  yield* svc.items.delete(first.id, null, deleted.id);
  yield* svc.items.create(second.id, null, null, "Other project");
  return { first, second, main, nested };
});
