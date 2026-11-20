import {
  createItem,
  csvImportFields,
  EntityMissing,
  LinkPolicy,
  type CsvImportContext,
  type CsvImportRow,
  type ItemFieldValue,
  type ItemLink,
  type TodoItem,
} from "@task-tracker/core";
import { Effect, Option } from "effect";
import type { SqlClient } from "effect/sql";
import { fieldRepository } from "../../db/repositories/field-repository.js";
import { folderRepository } from "../../db/repositories/folder-repository.js";
import { itemFieldValueRepository } from "../../db/repositories/item-field-value-repository.js";
import { itemLinkRepository } from "../../db/repositories/item-link-repository.js";
import { itemRepository } from "../../db/repositories/item-repository.js";
import { lookupRepository } from "../../db/repositories/lookup-repository.js";
import { projectRepository } from "../../db/repositories/project-repository.js";
import { statusRepository } from "../../db/repositories/status-repository.js";
import { appendNewTickets } from "../ticket-ranks.js";

/** The project, and the folder inside it, that a CSV import adds its rows to. */
export interface CsvImportTarget {
  readonly projectId: string;
  readonly folderId: string | null;
}

/** Fails like the legacy importer when the project, or the folder in it, is missing or deleted. */
const requireTarget = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  { projectId, folderId }: CsvImportTarget,
) {
  if (Option.isNone(yield* projectRepository(sql).findActive(projectId))) {
    return yield* Effect.fail(new EntityMissing("Project"));
  }
  const folders = folderId === null ? [] : yield* folderRepository(sql).listActive(projectId);
  if (folderId !== null && !folders.some((folder) => folder.id === folderId)) {
    return yield* Effect.fail(new EntityMissing("Folder"));
  }
});

/** Loads what a CSV import matches cells against on the caller's transaction (§7.9). */
export const loadCsvImportContext = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  target: CsvImportTarget,
) {
  yield* requireTarget(sql, target);
  const lookups = lookupRepository(sql);
  const fields = fieldRepository(sql);
  const context: CsvImportContext = {
    itemTypes: yield* lookups.itemTypes.list(),
    priorityLevels: yield* lookups.priorityLevels.list(),
    statuses: yield* statusRepository(sql).list(),
    fields: csvImportFields(yield* fields.definitions.list(), target.projectId),
    choices: yield* fields.choices.listAll(undefined),
  };
  return context;
});

/** One imported row as a new open or completed top-level item. */
function itemOf(
  row: CsvImportRow,
  target: CsvImportTarget,
  id: string,
  sortOrder: number,
  now: Temporal.Instant,
): TodoItem {
  const created = createItem(id, target.projectId, target.folderId, null, row.title, now);
  return {
    ...created,
    // The reader already trimmed like .NET, which keeps U+FEFF that JavaScript's trim drops.
    title: row.title,
    sortOrder,
    description: row.description,
    ticketNumber: row.ticketNumber,
    itemTypeId: row.itemTypeId,
    priorityLevelId: row.priorityLevelId,
    dueDate: row.dueDate,
    dueTime: row.dueTime,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    statusId: row.statusId,
    completedAtUtc: row.completedAtUtc,
  };
}

function valuesOf(row: CsvImportRow, itemId: string): ItemFieldValue[] {
  return row.fieldValues.map((value) => ({
    itemId,
    fieldDefinitionId: value.fieldDefinitionId,
    textValue: value.textValue ?? null,
    numberValue: value.numberValue ?? null,
    dateValue: value.dateValue ?? null,
    boolValue: value.boolValue ?? null,
    choiceId: value.choiceId ?? null,
  }));
}

function linksOf(
  row: CsvImportRow,
  itemId: string,
  newId: () => string,
  now: Temporal.Instant,
): ItemLink[] {
  return row.linkUrls.map((url, position) => ({
    id: newId(),
    itemId,
    url: LinkPolicy.normalizeUrl(url),
    title: null,
    sortOrder: position,
    createdAtUtc: now,
  }));
}

/** The next sort order after every top-level item in the area, deleted ones included. */
const nextSortOrder = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  target: CsvImportTarget,
) {
  const existing = yield* itemRepository(sql).loadAreaIncludingDeleted(target);
  const orders = existing
    .filter((item) => item.parentItemId === null)
    .map((item) => item.sortOrder);
  return Math.max(-1, ...orders) + 1;
});

/**
 * Adds validated rows as new top-level items at the end of the target area on
 * the caller's transaction, with their values and links, then ranks the new
 * open tickets at the bottom of their sections (§7.9, §7.16).
 */
export const writeCsvRows = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly CsvImportRow[],
  target: CsvImportTarget,
  now: Temporal.Instant,
  newId: () => string,
) {
  const firstOrder = yield* nextSortOrder(sql, target);
  const items = rows.map((row, index) => itemOf(row, target, newId(), firstOrder + index, now));
  const values = rows.flatMap((row, index) => valuesOf(row, items[index]!.id));
  const links = rows.flatMap((row, index) => linksOf(row, items[index]!.id, newId, now));
  yield* Effect.forEach(items, itemRepository(sql).insert, { discard: true });
  yield* Effect.forEach(values, itemFieldValueRepository(sql).upsert, { discard: true });
  yield* Effect.forEach(links, itemLinkRepository(sql).insert, { discard: true });
  yield* appendNewTickets(
    sql,
    items.map((item) => item.id),
  );
});
