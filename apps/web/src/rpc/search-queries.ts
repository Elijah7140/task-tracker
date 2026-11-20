import type { FieldFilter, ItemQuery, SearchableField, SearchScope } from "@task-tracker/contracts";
import { FIELD_CHOICES_KEY, FIELDS_KEY, fieldChoicesKey } from "./field-queries.js";
import { HISTORY_KEY, HISTORY_REPLAY_KEY } from "./history-queries.js";
import { ITEM_TYPES_KEY, LOOKUPS_KEY, PRIORITY_LEVELS_KEY } from "./lookup-queries.js";
import { PROJECTS_KEY } from "./project-queries.js";
import { TaskTrackerClient } from "./task-tracker-client.js";

/** The page size Search requests and names in its more-results note (§7.2). */
export const SEARCH_RESULT_LIMIT = 200;

/** The fields Search offers in `scope`. Field and project changes refresh it. */
export const searchFieldsAtom = (scope: typeof SearchScope.Type) =>
  TaskTrackerClient.query(
    "ListSearchFields",
    { scope },
    { reactivityKeys: [HISTORY_REPLAY_KEY, FIELDS_KEY, PROJECTS_KEY] },
  );

function choiceKeys(field: typeof SearchableField.Type): ReadonlyArray<string> {
  if (field.fieldDefinitionId !== null) {
    return [FIELD_CHOICES_KEY, fieldChoicesKey(field.fieldDefinitionId)];
  }
  return [LOOKUPS_KEY, field.key === "type" ? ITEM_TYPES_KEY : PRIORITY_LEVELS_KEY];
}

/** The active choices of a choice field in `scope`, refreshed by choice and lookup changes. */
export const searchChoicesAtom = (
  scope: typeof SearchScope.Type,
  field: typeof SearchableField.Type,
) =>
  TaskTrackerClient.query(
    "ListSearchChoices",
    { scope, fieldKey: field.key },
    { reactivityKeys: [HISTORY_REPLAY_KEY, FIELDS_KEY, ...choiceKeys(field)] },
  );

/**
 * One bounded page of results for a submitted query. Any recorded write or
 * replayed step refreshes it, so results never show undone changes.
 */
export const searchResultsAtom = (query: typeof ItemQuery.Type) =>
  TaskTrackerClient.query(
    "SearchItems",
    { query, limit: SEARCH_RESULT_LIMIT },
    { reactivityKeys: [HISTORY_KEY, HISTORY_REPLAY_KEY] },
  );

/** Resolves an active item's current project and folder when a result is opened. */
export const locateSearchItemAtom = TaskTrackerClient.mutation("LocateSearchItem");

/** Parses the query box text against the fields and choices in its scope (§7.7). */
export const parseSearchQueryAtom = TaskTrackerClient.mutation("ParseSearchQuery");

/**
 * The canonical query text for free text and complete filter rows. Field, choice and
 * lookup changes refresh it, so the box shows current labels (§7.7).
 */
export const formattedSearchQueryAtom = (
  scope: typeof SearchScope.Type,
  text: string | null,
  filters: ReadonlyArray<typeof FieldFilter.Type>,
) =>
  TaskTrackerClient.query(
    "FormatSearchQuery",
    { scope, text, filters },
    { reactivityKeys: [HISTORY_REPLAY_KEY, FIELDS_KEY, FIELD_CHOICES_KEY, LOOKUPS_KEY] },
  );
