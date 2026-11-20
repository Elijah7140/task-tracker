import {
  listOf,
  nameKey,
  parseTransferScopeKind,
  TakenNames,
  TRANSFER_NAME_MAX_LENGTH,
  TRANSFER_QUERY_TEXT_MAX_LENGTH,
  type SavedSearch,
  type SavedSearchDocument,
  type SearchScope,
} from "@task-tracker/core";
import { rewriteQueryField } from "../../db/migrations/rewrite-query-field.js";
import {
  type ImportContext,
  type ImportExisting,
  importTimestamps,
  nextSortOrder,
  sortOrderPositions,
} from "./import-plan.js";

const GUID_REFERENCE = /#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/** Custom keys that later became built-in; a renamed field keeps its saved references. */
const LEGACY_KEYS = ["link", "repeats", "reminder", "completed"];

function scopeOf(context: ImportContext, document: SavedSearchDocument): SearchScope {
  const kind = parseTransferScopeKind(document.scopeKind);
  if (kind === "AllProjects") {
    return { kind: "allProjects" };
  }
  const projectId = context.map.projects.get(document.projectId!)!;
  if (kind === "Project") {
    return { kind: "project", projectId };
  }
  const folderId = document.folderId === null ? null : context.map.folders.get(document.folderId)!;
  return {
    kind: "area",
    projectId,
    folderId,
    includeSubfolders: document.includeSubfolders !== false,
  };
}

/** Rewrites `#id` choices, types and priorities to the ids they now have, written like legacy. */
function rewriteIds(context: ImportContext, query: string): string {
  const replacements = context.map.queryIds();
  return query.replace(GUID_REFERENCE, (match, id: string) => {
    const replacement = replacements.get(id.toUpperCase());
    return replacement === undefined ? match : `#${replacement.toLowerCase()}`;
  });
}

function rewriteLegacyKey(
  context: ImportContext,
  query: string,
  scope: SearchScope,
  key: string,
): string {
  const field = context.map.fields.get(nameKey(key));
  if (field === undefined || field.key === key) {
    return query;
  }
  const owner = field.projectId;
  const inScope = scope.kind === "allProjects" || owner === null || owner === scope.projectId;
  return inScope ? rewriteQueryField(query, key, field.key) : query;
}

/**
 * The stored query with new ids and renamed legacy custom keys. A file written before
 * statuses existed (no `statuses` list) used `status` for completion, now `completed` (§7.15).
 */
function importedQuery(
  context: ImportContext,
  document: SavedSearchDocument,
  scope: SearchScope,
): string {
  let query = rewriteIds(context, document.queryText!);
  for (const key of LEGACY_KEYS) {
    query = rewriteLegacyKey(context, query, scope, key);
  }
  return context.document.statuses === null
    ? rewriteQueryField(query, "status", "completed")
    : query;
}

function createSearch(
  context: ImportContext,
  document: SavedSearchDocument,
  name: string,
  query: string,
  sortOrder: number,
  scope: SearchScope,
): SavedSearch {
  return {
    id: context.newId(),
    name,
    queryText: query,
    scope,
    includeCompleted: document.includeCompleted === true,
    sortOrder,
    ...importTimestamps(document.createdAtUtc, document.updatedAtUtc, context.now),
  };
}

/**
 * Plans the file's saved searches as new ones (names suffixed like projects),
 * pointing at the new projects and folders, and returns how many the file holds.
 */
export function importSavedSearches(context: ImportContext, existing: ImportExisting): number {
  const names = new TakenNames(
    existing.savedSearches.map((search) => search.name),
    TRANSFER_NAME_MAX_LENGTH,
  );
  let order = nextSortOrder(existing.savedSearches);
  const documents = listOf(context.document.savedSearches);
  for (const position of sortOrderPositions(documents, (search) => search.sortOrder)) {
    const document = documents[position]!;
    const scope = scopeOf(context, document);
    const query = importedQuery(context, document, scope);
    const sortOrder = order++;
    if (query.length > TRANSFER_QUERY_TEXT_MAX_LENGTH) {
      const message = `Renaming a custom field makes the query longer than ${TRANSFER_QUERY_TEXT_MAX_LENGTH} characters.`;
      context.issues.add(`$.savedSearches[${position}].queryText`, message);
      continue;
    }
    const name = names.reserve(document.name!);
    context.plan.savedSearches.push(createSearch(context, document, name, query, sortOrder, scope));
  }
  return documents.length;
}
