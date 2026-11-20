import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { nameKey } from "../metadata/names.js";
import type { SavedSearch } from "./saved-search.js";

/** The rule message for a name another saved search already uses. */
export function duplicateSavedSearchMessage(existingName: string): string {
  return `A saved search named '${existingName}' already exists.`;
}

/**
 * Finds the saved search whose name matches `name` ignoring case, skipping the
 * search with `ignoredId` so a rename can change only the letter case.
 */
export function findSavedSearchByName(
  all: ReadonlyArray<SavedSearch>,
  name: string,
  ignoredId: string | null,
): SavedSearch | undefined {
  const key = nameKey(name);
  return all.find((search) => search.id !== ignoredId && nameKey(search.name) === key);
}

/** Refuses `name` when another saved search already uses it, ignoring case. */
export function ensureSavedSearchNameFree(
  all: ReadonlyArray<SavedSearch>,
  name: string,
  ignoredId: string | null,
): void {
  const clash = findSavedSearchByName(all, name, ignoredId);
  if (clash !== undefined) {
    throw new MetadataRuleError(duplicateSavedSearchMessage(clash.name));
  }
}

/** The position after every existing saved search. */
export function nextSavedSearchSortOrder(all: ReadonlyArray<SavedSearch>): number {
  return all.reduce((next, search) => Math.max(next, search.sortOrder + 1), 0);
}

/**
 * Puts the listed searches first in the given order, keeps the others after them in
 * their current order and numbers every search from zero. Unknown or repeated IDs are
 * a rule error.
 */
export function arrangeSavedSearches(
  all: ReadonlyArray<SavedSearch>,
  orderedIds: ReadonlyArray<string>,
): ReadonlyArray<SavedSearch> {
  const remaining = new Map(all.map((search) => [search.id, search]));
  const listed = orderedIds.map((id) => {
    const search = remaining.get(id);
    if (search === undefined) {
      throw new MetadataRuleError(
        "The new order names a saved search that does not exist or repeats one.",
      );
    }
    remaining.delete(id);
    return search;
  });
  const rest = all.filter((search) => remaining.has(search.id));
  return [...listed, ...rest].map((search, sortOrder) => ({ ...search, sortOrder }));
}

/** The first name in `names` that repeats an earlier one ignoring case, if any. */
export function repeatedSavedSearchName(names: ReadonlyArray<string>): string | undefined {
  const seen = new Set<string>();
  return names.find((name) => {
    const key = nameKey(name);
    const repeated = seen.has(key);
    seen.add(key);
    return repeated;
  });
}
