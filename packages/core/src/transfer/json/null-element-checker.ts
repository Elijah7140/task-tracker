import { IssueList, type TransferIssue } from "../transfer-issue.js";
import type {
  DocumentList,
  ExportDocument,
  ItemDocument,
  ProjectDocument,
} from "./export-document.js";
import { elementPath } from "./json-path.js";

function checkList<T>(list: DocumentList<T>, path: string, issues: IssueList): void {
  (list ?? []).forEach((element, index) => {
    if (element === null) {
      issues.add(elementPath(path, index), "must be an object");
    }
  });
}

function checkItems(items: DocumentList<ItemDocument>, path: string, issues: IssueList): void {
  checkList(items, path, issues);
  (items ?? []).forEach((item, index) => {
    const itemPath = elementPath(path, index);
    checkList(item?.fieldValues ?? null, `${itemPath}.fieldValues`, issues);
    checkList(item?.links ?? null, `${itemPath}.links`, issues);
  });
}

function checkProjects(projects: DocumentList<ProjectDocument>, issues: IssueList): void {
  checkList(projects, "$.projects", issues);
  (projects ?? []).forEach((project, index) => {
    const path = elementPath("$.projects", index);
    checkList(project?.folders ?? null, `${path}.folders`, issues);
    checkItems(project?.items ?? null, `${path}.items`, issues);
  });
}

/**
 * Finds `null` where a list should hold an object (`"projects":[null]`). The
 * validators assume every element exists, so this runs first and reports positions.
 */
export function findNullElements(document: ExportDocument): readonly TransferIssue[] {
  const issues = new IssueList();
  checkList(document.itemTypes, "$.itemTypes", issues);
  checkList(document.priorityLevels, "$.priorityLevels", issues);
  checkList(document.statuses, "$.statuses", issues);
  checkList(document.savedSearches, "$.savedSearches", issues);
  checkList(document.fields, "$.fields", issues);
  (document.fields ?? []).forEach((field, index) => {
    checkList(field?.choices ?? null, `${elementPath("$.fields", index)}.choices`, issues);
  });
  checkProjects(document.projects, issues);
  return issues.items;
}
