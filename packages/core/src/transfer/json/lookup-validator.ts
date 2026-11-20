import { nameKey } from "../../metadata/names.js";
import type { IssueList } from "../transfer-issue.js";
import type { DocumentList, LookupDocument } from "./export-document.js";
import { listOf } from "./export-document.js";
import { checkId, checkName, isBlank, NAME_MAX_LENGTH, trimText } from "./import-checks.js";
import { elementPath } from "./json-path.js";

/** A status kind read from a file: "open" or "done" in any case. */
export type StatusKindName = "Open" | "Done";

/** Reads "open" or "done" in any case; null for anything else. */
export function readStatusKind(kind: string | null): StatusKindName | null {
  const lower = kind === null ? null : trimText(kind).toLowerCase();
  return lower === "open" ? "Open" : lower === "done" ? "Done" : null;
}

/** A numbered priority level may leave its name empty. */
export function isNumberOnly(lookup: LookupDocument): boolean {
  return lookup.number !== null && isBlank(lookup.name);
}

function checkIdsAndNames(
  lookups: readonly LookupDocument[],
  path: string,
  issues: IssueList,
  allowNumberOnly: boolean,
): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  lookups.forEach((lookup, index) => {
    const itemPath = elementPath(path, index);
    checkId(lookup.id, `${itemPath}.id`, ids, issues);
    if (!allowNumberOnly || !isNumberOnly(lookup)) {
      checkUniqueName(lookup.name, `${itemPath}.name`, names, issues);
    }
  });
}

function checkUniqueName(name: string | null, path: string, names: Set<string>, issues: IssueList) {
  if (!checkName(name, NAME_MAX_LENGTH, path, issues)) {
    return;
  }
  const trimmed = trimText(name);
  if (names.has(nameKey(trimmed))) {
    issues.add(path, `The name '${trimmed}' is used more than once.`);
  }
  names.add(nameKey(trimmed));
}

/** Checks an item type list: unique ids and unique, valid names. */
export function validateItemTypes(
  lookups: DocumentList<LookupDocument>,
  path: string,
  issues: IssueList,
) {
  checkIdsAndNames(listOf(lookups), path, issues, false);
}

function isValidNumber(level: LookupDocument, activeNumbers: Set<number>): boolean {
  if (level.number === null) {
    return true;
  }
  if (level.number < 1) {
    return false;
  }
  if (level.isArchived === true) {
    return true;
  }
  const fresh = !activeNumbers.has(level.number);
  activeNumbers.add(level.number);
  return fresh;
}

/** Checks a priority level list, including numbers that are positive and unique while active. */
export function validatePriorityLevels(
  levels: DocumentList<LookupDocument>,
  path: string,
  issues: IssueList,
) {
  checkIdsAndNames(listOf(levels), path, issues, true);
  const activeNumbers = new Set<number>();
  listOf(levels).forEach((level, index) => {
    if (!isValidNumber(level, activeNumbers)) {
      const message = "Expected a positive number unique among active priorities.";
      issues.add(`${elementPath(path, index)}.number`, message);
    }
  });
}

/** Checks a status list, including each status's kind. */
export function validateStatuses(
  statuses: DocumentList<LookupDocument>,
  path: string,
  issues: IssueList,
) {
  checkIdsAndNames(listOf(statuses), path, issues, false);
  listOf(statuses).forEach((status, index) => {
    if (readStatusKind(status.kind) === null) {
      issues.add(`${elementPath(path, index)}.kind`, "Expected 'open' or 'done'.");
    }
  });
}
