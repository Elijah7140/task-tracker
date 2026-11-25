import { isBlankText } from "@task-tracker/contracts";
import type { Item, ItemEdit } from "@task-tracker/contracts";

type ItemRecord = typeof Item.Type;
type Edit = typeof ItemEdit.Type;

/** The built-in fields the editor changes. */
export type BuiltInKey = keyof Edit;

/** Built-in values in the string forms the inputs use; "" means no value. */
export type BuiltInTexts = Readonly<Record<BuiltInKey, string>>;

/** The built-in values the user typed, by field. Untouched fields are absent. */
export type BuiltInOverrides = Partial<BuiltInTexts>;

const BUILT_IN_KEYS: ReadonlyArray<BuiltInKey> = [
  "title",
  "description",
  "notes",
  "ticketNumber",
  "priorityLevelId",
  "statusId",
  "dueDate",
  "dueTime",
];

// Time inputs edit minutes, so stored seconds and fractions are shown truncated.
const minutes = (time: string | null) => time?.slice(0, 5) ?? "";

/** The stored item's built-in values in the forms the inputs show. */
export function storedTexts(item: ItemRecord): BuiltInTexts {
  return {
    title: item.title,
    description: item.description ?? "",
    notes: item.notes ?? "",
    ticketNumber: item.ticketNumber ?? "",
    priorityLevelId: item.priorityLevelId ?? "",
    statusId: item.statusId ?? "",
    dueDate: item.dueDate ?? "",
    dueTime: minutes(item.dueTime),
  };
}

/** What the inputs show: typed values over the stored ones. */
export function draftTexts(item: ItemRecord, overrides: BuiltInOverrides): BuiltInTexts {
  return { ...storedTexts(item), ...overrides };
}

/** The built-in fields whose typed value differs from what the stored item shows. */
function changedKeys(item: ItemRecord, overrides: BuiltInOverrides): ReadonlySet<BuiltInKey> {
  const stored = storedTexts(item);
  return new Set(
    BUILT_IN_KEYS.filter((key) => overrides[key] !== undefined && overrides[key] !== stored[key]),
  );
}

/** True when any typed built-in value differs from the stored item. */
export function isBuiltInDraftChanged(item: ItemRecord, overrides: BuiltInOverrides): boolean {
  return changedKeys(item, overrides).size > 0;
}

/**
 * The replacement built-in fields. Unchanged fields send the stored value, so
 * archived lookups and the full precision of stored times are kept until the
 * user replaces them. Blank optional text clears the value; the server checks
 * everything else.
 */
export function itemEdit(item: ItemRecord, overrides: BuiltInOverrides): Edit {
  const changed = changedKeys(item, overrides);
  const valueOf = (key: Exclude<BuiltInKey, "title">) => {
    const typed = overrides[key] ?? "";
    if (!changed.has(key)) {
      return item[key];
    }
    return isBlankText(typed) ? null : typed;
  };
  return {
    title: changed.has("title") ? (overrides.title ?? "") : item.title,
    description: valueOf("description"),
    notes: valueOf("notes"),
    ticketNumber: valueOf("ticketNumber"),
    priorityLevelId: valueOf("priorityLevelId"),
    ...(changed.has("statusId") ? { statusId: valueOf("statusId") } : {}),
    dueDate: valueOf("dueDate"),
    dueTime: valueOf("dueTime"),
  };
}
