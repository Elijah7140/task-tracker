import { IssueList, type TransferIssue } from "../transfer-issue.js";
import type { ExportDocument, ProjectDocument } from "./export-document.js";
import { listOf } from "./export-document.js";
import { FieldDocumentValidator } from "./field-document-validator.js";
import { FolderValidator } from "./folder-validator.js";
import { checkId, checkName, NAME_MAX_LENGTH } from "./import-checks.js";
import { ImportIndex } from "./import-index.js";
import { ItemValidator } from "./item-validator.js";
import { elementPath } from "./json-path.js";
import { validateItemTypes, validatePriorityLevels, validateStatuses } from "./lookup-validator.js";
import { validateSavedSearches } from "./saved-search-validator.js";
import { validateSettings } from "./settings-validator.js";
import { checkTimestamp } from "./timestamp-checks.js";

function validateProjectHeader(
  project: ProjectDocument,
  path: string,
  projectIds: Set<string>,
  issues: IssueList,
): void {
  checkId(project.id, `${path}.id`, projectIds, issues);
  checkName(project.name, NAME_MAX_LENGTH, `${path}.name`, issues);
  checkTimestamp(project.createdAtUtc, `${path}.createdAtUtc`, issues);
  checkTimestamp(project.updatedAtUtc, `${path}.updatedAtUtc`, issues);
  validateSettings(project.settings, `${path}.settings`, issues);
}

function validateProjects(document: ExportDocument, index: ImportIndex, issues: IssueList): void {
  const projectIds = new Set<string>();
  const folders = new FolderValidator(issues, new Set());
  const items = new ItemValidator(index, issues, new Set());
  listOf(document.projects).forEach((project, position) => {
    const path = elementPath("$.projects", position);
    validateProjectHeader(project, path, projectIds, issues);
    folders.validate(listOf(project.folders), `${path}.folders`);
    items.validate(project, `${path}.items`);
  });
}

/**
 * Checks a whole import document without touching the database: references,
 * §5.1 invariants and §7.1 value rules, each problem with its JSON path.
 */
export function validateImportDocument(document: ExportDocument): readonly TransferIssue[] {
  const issues = new IssueList();
  const index = new ImportIndex(document);
  validateItemTypes(document.itemTypes, "$.itemTypes", issues);
  validatePriorityLevels(document.priorityLevels, "$.priorityLevels", issues);
  validateStatuses(document.statuses, "$.statuses", issues);
  new FieldDocumentValidator(index, issues).validate(document.fields);
  validateProjects(document, index, issues);
  validateSavedSearches(document.savedSearches, index, issues);
  return issues.items;
}
