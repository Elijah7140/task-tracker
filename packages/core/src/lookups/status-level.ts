import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey, normalizeName } from "../metadata/names.js";
import { orderRows } from "../metadata/order-rows.js";

/** The fixed completion semantics of a workflow status. */
export type StatusKind = "Open" | "Done";

/** An editable workflow status whose kind is fixed at creation. */
export interface StatusLevel {
  readonly id: string;
  readonly name: string;
  readonly kind: StatusKind;
  readonly isArchived: boolean;
  readonly sortOrder: number;
  /** Open items with an in-progress status are listed on the tray card (§7.18). */
  readonly isInProgress: boolean;
}

/** Appends an active status after both active and archived entries. */
export function createStatus(
  id: string,
  name: string,
  kind: StatusKind,
  rows: readonly StatusLevel[],
): StatusLevel {
  if (kind !== "Open" && kind !== "Done") {
    throw new MetadataRuleError("Choose an Open or Done status kind.");
  }
  const sortOrder = Math.max(-1, ...rows.map((row) => row.sortOrder)) + 1;
  const status = { id, name: "", kind, sortOrder, isArchived: false, isInProgress: false };
  return { ...status, name: uniqueStatusName(status, name, rows, "Restore it instead.") };
}

/** Reserves status names case-insensitively, including archived rows. */
export function renameStatus(
  row: StatusLevel,
  name: string,
  rows: readonly StatusLevel[],
): StatusLevel {
  const advice = "Restore or rename that one first.";
  return { ...row, name: uniqueStatusName(row, name, rows, advice) };
}

function uniqueStatusName(
  row: StatusLevel,
  name: string,
  rows: readonly StatusLevel[],
  archivedAdvice: string,
): string {
  const normalized = normalizeName(name, "Name", false);
  const key = nameKey(normalized);
  const clash = rows.find((other) => other.id !== row.id && nameKey(other.name) === key);
  if (clash?.isArchived) {
    throw new MetadataRuleError(
      `The name '${normalized}' is used by an archived status. ${archivedAdvice}`,
    );
  }
  if (clash !== undefined) {
    throw new MetadataRuleError(`The name '${normalized}' is already used by another status.`);
  }
  return normalized;
}

/** Archives or restores a status while ensuring completion always has an active Done status. */
export function setStatusArchived(
  row: StatusLevel,
  isArchived: boolean,
  rows: readonly StatusLevel[],
): StatusLevel {
  if (
    isArchived &&
    row.kind === "Done" &&
    !rows.some((other) => other.id !== row.id && other.kind === "Done" && !other.isArchived)
  ) {
    throw new MetadataRuleError("At least one Done status must stay active.");
  }
  return { ...row, isArchived };
}

/**
 * Marks a status as in progress or not (§7.18). Only an Open status can be in
 * progress, because the tray card lists open items; any number of statuses may be.
 */
export function setStatusInProgress(row: StatusLevel, isInProgress: boolean): StatusLevel {
  if (isInProgress && row.kind !== "Open") {
    throw new MetadataRuleError("Only an Open status can be marked In progress.");
  }
  return { ...row, isInProgress };
}

/** Reorders the full status list, including archived entries. */
export function reorderStatuses(
  rows: readonly StatusLevel[],
  ids: readonly string[],
): StatusLevel[] {
  return orderRows(rows, ids, "Order must contain every lookup exactly once.");
}

/** The Done status that completing an item sets: the first active one in list order. */
export function firstDoneStatus(rows: readonly StatusLevel[]): StatusLevel | undefined {
  return rows
    .filter((row) => row.kind === "Done" && !row.isArchived)
    .toSorted((left, right) => left.sortOrder - right.sortOrder || compareIds(left.id, right.id))
    .at(0);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Names the first uniqueness rule a final status list breaks: names compare with the
 * lookup name key, including archived rows, and every row needs its own rank.
 */
export function statusListConflict(
  rows: readonly Pick<StatusLevel, "name" | "sortOrder">[],
): "name" | "rank" | null {
  if (new Set(rows.map((row) => nameKey(row.name))).size !== rows.length) {
    return "name";
  }
  return new Set(rows.map((row) => row.sortOrder)).size === rows.length ? null : "rank";
}
