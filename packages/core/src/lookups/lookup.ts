import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey, normalizeName } from "../metadata/names.js";
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
): PriorityLevel {
  const row: PriorityLevel = newLookup(id, rows.length);
  return renameLookup(row, name, rows);
}

/** Renames a lookup after checking all names of its kind, including archived names. */
export function renameLookup<Row extends Lookup>(
  row: Row,
  name: string,
  rows: readonly Lookup[],
): LookupChange<Row, "name"> {
  const normalized = normalizeName(name, "Name", false);
  const key = nameKey(normalized);
  const isItemType = "iconKey" in row;
  if (
    rows.some(
      (other) =>
        "iconKey" in other === isItemType && other.id !== row.id && nameKey(other.name) === key,
    )
  ) {
    const kind = isItemType ? "item type" : "priority level";
    throw new MetadataRuleError(`The name '${normalized}' is already used by another ${kind}.`);
  }
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
