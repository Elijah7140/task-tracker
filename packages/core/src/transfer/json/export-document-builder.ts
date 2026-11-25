import type { FieldChoice } from "../../fields/field-choice.js";
import type { FieldDefinition } from "../../fields/field-definition.js";
import type { ItemFieldValue } from "../../fields/item-field-value.js";
import { nameKey } from "../../metadata/names.js";
import type { LookupEntity } from "../../lookups/lookup-entity.js";
import type { StatusLevel } from "../../lookups/status-level.js";
import type { TicketListEntry } from "../../tickets/ticket-list-entry.js";
import type { Folder } from "../../projects/folder.js";
import { formatTransferUtc } from "../transfer-time-format.js";
import { EXPORT_FORMAT_NAME, EXPORT_FORMAT_VERSION } from "./export-document.js";
import { exportGuid, optionalString, ordinal, settingsObject } from "./export-values.js";
import { buildProjectDocument } from "./project-document-builder.js";
import type {
  ExportCatalogue,
  ExportSource,
  ProjectExportData,
  SavedSearchRow,
} from "./export-source.js";
import {
  jsonArray,
  jsonBoolean,
  jsonInteger,
  jsonObject,
  jsonString,
  type JsonOut,
} from "./json-writer.js";

const bySortOrder = <T extends { readonly sortOrder: number }>(rows: readonly T[]) =>
  rows.toSorted((left, right) => left.sortOrder - right.sortOrder);

function lookupMembers(lookup: LookupEntity) {
  return [
    ["id", exportGuid(lookup.id)],
    ["name", jsonString(lookup.name)],
  ] as const;
}

function lookupFlags(lookup: LookupEntity) {
  return [
    ["isBuiltIn", jsonBoolean(lookup.isBuiltIn)],
    ["isArchived", jsonBoolean(lookup.isArchived)],
    ["sortOrder", jsonInteger(lookup.sortOrder)],
  ] as const;
}

function priorityLevels(
  catalogue: ExportCatalogue,
  projects: readonly ProjectExportData[],
  whole: boolean,
) {
  const used = new Set(projects.flatMap((data) => data.items.map((item) => item.priorityLevelId)));
  const selected = catalogue.priorityLevels.filter((level) => whole || used.has(level.id));
  return bySortOrder(selected).map((level) =>
    jsonObject([
      ...lookupMembers(level),
      ["number", level.number === null ? null : jsonInteger(level.number)],
      ["colorKey", optionalString(level.colorKey)],
      ...lookupFlags(level),
    ]),
  );
}

function statuses(
  catalogue: ExportCatalogue,
  projects: readonly ProjectExportData[],
  whole: boolean,
) {
  const items = projects.flatMap((data) => data.items);
  const used = new Set(items.flatMap((item) => [item.statusId, item.reopenStatusId]));
  const selected = catalogue.statuses.filter((status) => whole || used.has(status.id));
  return bySortOrder(selected).map((status: StatusLevel) =>
    jsonObject([
      ["id", exportGuid(status.id)],
      ["name", jsonString(status.name)],
      ["kind", jsonString(status.kind === "Done" ? "done" : "open")],
      ["isArchived", jsonBoolean(status.isArchived)],
      ["sortOrder", jsonInteger(status.sortOrder)],
    ]),
  );
}

/** Entry ids a project's tickets use, plus the levels above them, so every chain is whole. */
function usedTicketEntries(catalogue: ExportCatalogue, projects: readonly ProjectExportData[]) {
  const used = new Set<string>();
  const parents = new Map(catalogue.ticketLists.map((entry) => [entry.id, entry.parentId]));
  const details = projects.flatMap((data) => data.ticketDetails);
  for (const detail of details) {
    const ids = [
      detail.requestorId,
      detail.applicationId,
      detail.moduleId,
      detail.interfaceId,
      detail.dispatchedToId,
      detail.pendingPersonId,
      detail.ticketTypeId,
    ];
    for (let id = ids.shift(); id !== undefined; id = ids.shift()) {
      if (id !== null && !used.has(id)) {
        used.add(id);
        ids.push(parents.get(id) ?? null);
      }
    }
  }
  return used;
}

/**
 * People, ticket types and levels (§7.19): every entry for the whole database, or the entries
 * the project's tickets use. Null leaves the property out when there are none.
 */
function ticketLists(
  catalogue: ExportCatalogue,
  projects: readonly ProjectExportData[],
  whole: boolean,
): JsonOut | null {
  const used = whole ? null : usedTicketEntries(catalogue, projects);
  const selected = catalogue.ticketLists.filter((entry) => used === null || used.has(entry.id));
  if (selected.length === 0) {
    return null;
  }
  return jsonArray(
    selected.map((entry: TicketListEntry) =>
      jsonObject([
        ["id", exportGuid(entry.id)],
        ["listKind", jsonString(entry.listKind)],
        ["parentId", exportGuid(entry.parentId)],
        ["name", jsonString(entry.name)],
        ["isArchived", jsonBoolean(entry.isArchived)],
        ["sortOrder", jsonInteger(entry.sortOrder)],
      ]),
    ),
  );
}

function isExportedField(
  field: FieldDefinition,
  projectIds: ReadonlySet<string>,
  usedFieldIds: ReadonlySet<string>,
  whole: boolean,
): boolean {
  return field.projectId !== null
    ? projectIds.has(field.projectId)
    : whole || usedFieldIds.has(field.id);
}

function choiceDocument(choice: FieldChoice): JsonOut {
  return jsonObject([
    ["id", exportGuid(choice.id)],
    ["label", jsonString(choice.label)],
    ["sortOrder", jsonInteger(choice.sortOrder)],
    ["isArchived", jsonBoolean(choice.isArchived)],
  ]);
}

function fieldDocument(field: FieldDefinition, choices: readonly FieldChoice[]): JsonOut {
  return jsonObject([
    ["id", exportGuid(field.id)],
    ["key", jsonString(field.key)],
    ["displayName", jsonString(field.displayName)],
    ["dataType", jsonString(field.dataType)],
    ["projectId", exportGuid(field.projectId)],
    ["isArchived", jsonBoolean(field.isArchived)],
    ["sortOrder", jsonInteger(field.sortOrder)],
    [
      "choices",
      jsonArray(
        choices.filter((choice) => choice.fieldDefinitionId === field.id).map(choiceDocument),
      ),
    ],
  ]);
}

function fields(
  catalogue: ExportCatalogue,
  projects: readonly ProjectExportData[],
  whole: boolean,
) {
  const projectIds = new Set(projects.map((data) => data.project.id));
  const usedFieldIds = new Set(
    projects.flatMap((data) => data.values.map((value: ItemFieldValue) => value.fieldDefinitionId)),
  );
  const choices = bySortOrder(catalogue.choices);
  return catalogue.fields
    .filter((field) => isExportedField(field, projectIds, usedFieldIds, whole))
    .toSorted((left, right) => left.sortOrder - right.sortOrder || ordinal(left.key, right.key))
    .map((field) => fieldDocument(field, choices));
}

function isExportedSearch(
  search: SavedSearchRow,
  projectIds: ReadonlySet<string>,
  folderIds: ReadonlySet<string>,
  whole: boolean,
): boolean {
  if (search.scopeKind === "AllProjects") {
    return whole;
  }
  const projectExported = search.projectId !== null && projectIds.has(search.projectId);
  return projectExported && (search.folderId === null || folderIds.has(search.folderId));
}

function savedSearchDocument(search: SavedSearchRow): JsonOut {
  return jsonObject([
    ["id", exportGuid(search.id)],
    ["name", jsonString(search.name)],
    ["queryText", jsonString(search.queryText)],
    ["scopeKind", jsonString(search.scopeKind)],
    ["projectId", exportGuid(search.projectId)],
    ["folderId", exportGuid(search.folderId)],
    ["includeSubfolders", jsonBoolean(search.includeSubfolders)],
    ["includeCompleted", jsonBoolean(search.includeCompleted)],
    ["sortOrder", jsonInteger(search.sortOrder)],
    ["createdAtUtc", jsonString(formatTransferUtc(search.createdAtUtc))],
    ["updatedAtUtc", jsonString(formatTransferUtc(search.updatedAtUtc))],
  ]);
}

/** Saved searches in the legacy list order: sort order, then name ignoring case, then stored order. */
function savedSearches(source: ExportSource): JsonOut[] {
  const projectIds = new Set(source.projects.map((data) => data.project.id));
  const folderIds = new Set(
    source.projects.flatMap((data) => data.folders.map((folder: Folder) => folder.id)),
  );
  return source.savedSearches
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder || ordinal(nameKey(left.name), nameKey(right.name)),
    )
    .filter((search) => isExportedSearch(search, projectIds, folderIds, source.wholeDatabase))
    .map(savedSearchDocument);
}

/**
 * Assembles the version 1 export document (§7.9) with the legacy property order
 * and row order, ready for {@link writeJson}.
 */
export function buildExportDocument(source: ExportSource): JsonOut {
  const { catalogue, projects, wholeDatabase: whole } = source;
  return jsonObject([
    ["format", jsonString(EXPORT_FORMAT_NAME)],
    ["version", jsonInteger(EXPORT_FORMAT_VERSION)],
    ["exportedAtUtc", jsonString(formatTransferUtc(source.exportedAtUtc))],
    ["scope", jsonString(whole ? "all" : "project")],
    ["priorityLevels", jsonArray(priorityLevels(catalogue, projects, whole))],
    ["statuses", jsonArray(statuses(catalogue, projects, whole))],
    ["fields", jsonArray(fields(catalogue, projects, whole))],
    ["globalSettings", whole ? settingsObject(source.globalSettings) : null],
    ["projects", jsonArray(projects.map((data) => buildProjectDocument(data, catalogue)))],
    ["savedSearches", jsonArray(savedSearches(source))],
    ["ticketLists", ticketLists(catalogue, projects, whole)],
  ]);
}
