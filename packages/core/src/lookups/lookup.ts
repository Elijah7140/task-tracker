import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey, normalizeName, trimMetadataText } from "../metadata/names.js";
import { orderRows } from "../metadata/order-rows.js";
import type { ItemType } from "./item-type.js";
import type { LookupEntity } from "./lookup-entity.js";
import type { PriorityLevel } from "./priority-level.js";

type Lookup = ItemType | PriorityLevel;
type LookupChange<Row, Key extends keyof LookupEntity> = Omit<Row, Key> & Pick<LookupEntity, Key>;

function newLookup(id: string, sortOrder: number) {
  return { id, sortOrder, name: "", colorKey: null, isBuiltIn: false, isArchived: false };
}

/** Appends a custom item type to a list containing both active and archived types. */
export function createItemType(id: string, name: string, rows: readonly ItemType[]): ItemType {
  const row: ItemType = { ...newLookup(id, rows.length), iconKey: null };
  return renameLookup(row, name, rows);
}

/** Appends a custom priority to a list containing both active and archived priorities. */
export function createPriorityLevel(
  id: string,
  name: string,
  rows: readonly PriorityLevel[],
  number: number | null = null,
): PriorityLevel {
  const row = { ...newLookup(id, rows.length), name, number };
  validatePriorityNumber(row, rows);
  return renameLookup(row, name, rows);
}

/** Legacy `PriorityLevel.Number` is a .NET Int32, so stored numbers stay within its range. */
const maxPriorityNumber = 2_147_483_647;

function validatePriorityNumber(row: PriorityLevel, rows: readonly PriorityLevel[]) {
  if (row.number === null) {
    return;
  }
  if (!Number.isSafeInteger(row.number) || row.number < 1) {
    throw new MetadataRuleError("Priority number must be a whole number of at least 1.");
  }
  if (row.number > maxPriorityNumber) {
    throw new MetadataRuleError(`Priority number must be no greater than ${maxPriorityNumber}.`);
  }
  if (
    !row.isArchived &&
    rows.some((other) => other.id !== row.id && !other.isArchived && other.number === row.number)
  ) {
    throw new MetadataRuleError(`Priority number ${row.number} is already in use.`);
  }
}

/** Edits the display number without changing rank. */
export function setPriorityNumber(
  row: PriorityLevel,
  number: number | null,
  rows: readonly PriorityLevel[],
): PriorityLevel {
  const updated = { ...row, number };
  validatePriorityNumber(updated, rows);
  if (number === null) {
    normalizeName(updated.name, "Name", false);
  }
  return updated;
}

/** Restores a priority only if its number is still available. */
export function restorePriorityLevel(
  row: PriorityLevel,
  rows: readonly PriorityLevel[],
): PriorityLevel {
  const restored = restoreLookup(row);
  validatePriorityNumber(restored, rows);
  return restored;
}

function assertUniqueName(row: Lookup, name: string, rows: readonly Lookup[]) {
  const isItemType = "iconKey" in row;
  const key = nameKey(name);
  const duplicate = rows.find(
    (other) =>
      "iconKey" in other === isItemType && other.id !== row.id && nameKey(other.name) === key,
  );
  if (duplicate === undefined) {
    return;
  }
  const kind = isItemType ? "item type" : "priority level";
  if (duplicate.isArchived) {
    const hint = rows.some((other) => other.id === row.id)
      ? "Restore or rename that one first."
      : "Restore it instead.";
    throw new MetadataRuleError(`The name '${name}' is used by an archived ${kind}. ${hint}`);
  }
  throw new MetadataRuleError(`The name '${name}' is already used by another ${kind}.`);
}

/** Renames a lookup after checking all names of its kind, including archived names. */
export function renameLookup<Row extends Lookup>(
  row: Row,
  name: string,
  rows: readonly Lookup[],
): LookupChange<Row, "name"> {
  if ("number" in row && row.number !== null && trimMetadataText(name) === "") {
    return { ...row, name: "" };
  }
  const normalized = normalizeName(name, "Name", false);
  assertUniqueName(row, normalized, rows);
  return { ...row, name: normalized };
}

/** Archives a lookup while keeping its identity available to existing items. */
export function archiveLookup<Row extends Lookup>(row: Row): LookupChange<Row, "isArchived"> {
  if (row.isBuiltIn && "iconKey" in row) {
    throw new MetadataRuleError("Built-in item types cannot be archived.");
  }
  return { ...row, isArchived: true };
}

/** Returns an archived lookup to the active list. */
export function restoreLookup<Row extends Lookup>(row: Row): LookupChange<Row, "isArchived"> {
  return { ...row, isArchived: false };
}

/** Reorders the complete list for one lookup kind, including archived rows. */
export function reorderLookups<Row extends Lookup>(
  rows: readonly Row[],
  ids: readonly string[],
): LookupChange<Row, "sortOrder">[] {
  return orderRows(rows, ids, "Order must contain every lookup exactly once.");
}

/** Lists selectable rows in their current order. */
export function activeLookups<Row extends Lookup>(rows: readonly Row[]): Row[] {
  return rows
    .filter((row) => !row.isArchived)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/** Sorts priorities from highest to lowest, followed by items with no priority. */
export function comparePriority(left: PriorityLevel | null, right: PriorityLevel | null): number {
  return (left?.sortOrder ?? Infinity) - (right?.sortOrder ?? Infinity) || 0;
}
