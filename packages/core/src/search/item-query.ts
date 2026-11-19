import type { FilterOperator } from "./filter-operator.js";
import type { FilterValue } from "./filter-value.js";
import type { SearchScope } from "./search-scope.js";

/** Default bounded search result limit (§7.2). */
export const DEFAULT_SEARCH_LIMIT = 200;

/** One condition in a search query. */
export interface FieldFilter {
  readonly fieldKey: string;
  readonly operator: FilterOperator;
  readonly value: FilterValue | null;
}

/** Search conditions whose filters are combined with AND (§7.2). */
export interface ItemQuery {
  readonly scope: SearchScope;
  readonly text: string | null;
  readonly filters: ReadonlyArray<FieldFilter>;
  readonly includeCompleted: boolean;
}

/** A compact item row returned by search. */
export interface ItemSearchResult {
  readonly itemId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly folderId: string | null;
  readonly parentItemId: string | null;
  readonly title: string;
  readonly ticketNumber: string | null;
  readonly itemTypeId: string | null;
  readonly priorityLevelId: string | null;
  readonly statusId: string | null;
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly isCompleted: boolean;
  readonly hasSchedule: boolean;
}

/** A bounded page of search results. */
export interface ItemSearchResults {
  readonly items: ReadonlyArray<ItemSearchResult>;
  readonly hasMore: boolean;
}
