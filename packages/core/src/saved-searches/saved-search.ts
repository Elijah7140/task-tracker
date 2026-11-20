import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { normalizeName } from "../metadata/names.js";
import type { SearchScope } from "../search/search-scope.js";

/** Longest stored query text (the legacy `QueryTextMaxLength`). */
export const SAVED_SEARCH_QUERY_MAX_LENGTH = 4000;

/** What a saved search remembers and runs again (§7.7). */
export interface SavedSearchDefinition {
  /** The parser's stable text: choices as `#id` and dates as typed, so renames never break it. */
  readonly queryText: string;
  readonly scope: SearchScope;
  readonly includeCompleted: boolean;
}

/** A named search the user can run again. Its scope IDs are deliberately not foreign keys. */
export interface SavedSearch extends SavedSearchDefinition {
  readonly id: string;
  /** Unique among saved searches, ignoring case. */
  readonly name: string;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}

/** Trims a saved-search name and checks its length. */
export function savedSearchName(name: string): string {
  return normalizeName(name, "Name");
}

function checkDefinition(definition: SavedSearchDefinition): SavedSearchDefinition {
  if (definition.queryText.length > SAVED_SEARCH_QUERY_MAX_LENGTH) {
    throw new MetadataRuleError(
      `A saved search can hold at most ${SAVED_SEARCH_QUERY_MAX_LENGTH} characters of query.`,
    );
  }
  const { queryText, scope, includeCompleted } = definition;
  return { queryText, scope, includeCompleted };
}

/** Creates a saved search at `sortOrder` with a validated name and definition. */
export function createSavedSearch(
  id: string,
  name: string,
  definition: SavedSearchDefinition,
  now: Temporal.Instant,
  sortOrder: number,
): SavedSearch {
  return {
    id,
    name: savedSearchName(name),
    ...checkDefinition(definition),
    sortOrder,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

/** Renames a saved search. Name clashes are checked against the whole list by the caller. */
export function renameSavedSearch(
  search: SavedSearch,
  name: string,
  now: Temporal.Instant,
): SavedSearch {
  return { ...search, name: savedSearchName(name), updatedAtUtc: now };
}

/** Replaces the stored query, scope and include-completed switch, keeping name and position. */
export function updateSavedSearch(
  search: SavedSearch,
  definition: SavedSearchDefinition,
  now: Temporal.Instant,
): SavedSearch {
  return { ...search, ...checkDefinition(definition), updatedAtUtc: now };
}
