import type { IssueList } from "../transfer-issue.js";
import type { DocumentList, SavedSearchDocument } from "./export-document.js";
import { listOf } from "./export-document.js";
import {
  checkId,
  checkName,
  NAME_MAX_LENGTH,
  parseScopeKind,
  QUERY_TEXT_MAX_LENGTH,
} from "./import-checks.js";
import type { ImportIndex } from "./import-index.js";
import { elementPath } from "./json-path.js";
import { checkTimestamp } from "./timestamp-checks.js";

function checkQueryText(queryText: string | null, path: string, issues: IssueList): void {
  if (queryText === null) {
    issues.add(path, "The query text is required (it may be empty).");
  } else if (queryText.length > QUERY_TEXT_MAX_LENGTH) {
    issues.add(path, `The query text must be ${QUERY_TEXT_MAX_LENGTH} characters or fewer.`);
  }
}

function checkScope(
  search: SavedSearchDocument,
  path: string,
  index: ImportIndex,
  issues: IssueList,
) {
  const kind = parseScopeKind(search.scopeKind);
  if (kind === null) {
    issues.add(`${path}.scopeKind`, "The scope must be AllProjects, Project or Folder.");
    return;
  }
  if (kind === "AllProjects") {
    return;
  }
  if (search.projectId === null || !index.projectIds.has(search.projectId)) {
    issues.add(
      `${path}.projectId`,
      "The search's project must be one of the projects in this file.",
    );
    return;
  }
  if (search.folderId !== null && index.projectOfFolder(search.folderId) !== search.projectId) {
    issues.add(`${path}.folderId`, "The search's folder must be in the search's project.");
  }
}

/** Checks the saved searches of an import document and that their scopes point into the file. */
export function validateSavedSearches(
  searches: DocumentList<SavedSearchDocument>,
  index: ImportIndex,
  issues: IssueList,
): void {
  const ids = new Set<string>();
  listOf(searches).forEach((search, position) => {
    const path = elementPath("$.savedSearches", position);
    checkId(search.id, `${path}.id`, ids, issues);
    checkName(search.name, NAME_MAX_LENGTH, `${path}.name`, issues);
    checkQueryText(search.queryText, `${path}.queryText`, issues);
    checkTimestamp(search.createdAtUtc, `${path}.createdAtUtc`, issues);
    checkTimestamp(search.updatedAtUtc, `${path}.updatedAtUtc`, issues);
    checkScope(search, path, index, issues);
  });
}
