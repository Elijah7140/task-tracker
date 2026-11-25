import { Schema } from "effect";
import { FieldDataType } from "./field-projection.js";
import { Guid } from "./guid.js";
import { IsoDate, IsoTime } from "./iso-date-time.js";

/** The projects and area included in a search (§7.2). */
export const SearchScope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("allProjects") }),
  Schema.Struct({ kind: Schema.Literal("project"), projectId: Guid }),
  Schema.Struct({
    kind: Schema.Literal("area"),
    projectId: Guid,
    folderId: Schema.NullOr(Guid),
    includeSubfolders: Schema.Boolean,
  }),
]);

/** An operation applied to one search field (§7.2). */
export const FilterOperator = Schema.Literals([
  "equals",
  "notEquals",
  "greaterThan",
  "lessThan",
  "between",
  "contains",
  "isEmpty",
  "isNotEmpty",
]);

/** A typed value supplied to a search field filter (§7.2). */
export const FilterValue = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), value: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("number"), value: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("date"), value: IsoDate }),
  Schema.Struct({ kind: Schema.Literal("boolean"), value: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("choice"), id: Guid }),
  Schema.Struct({ kind: Schema.Literal("choiceRange"), min: Guid, max: Guid }),
  Schema.Struct({ kind: Schema.Literal("numberRange"), min: Schema.Number, max: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("dateRange"), min: IsoDate, max: IsoDate }),
]);

/** One condition in a search query. */
export const FieldFilter = Schema.Struct({
  fieldKey: Schema.String,
  operator: FilterOperator,
  value: Schema.NullOr(FilterValue),
});

/** Search conditions whose filters are combined with AND (§7.2). */
export const ItemQuery = Schema.Struct({
  scope: SearchScope,
  text: Schema.NullOr(Schema.String),
  filters: Schema.Array(FieldFilter),
  includeCompleted: Schema.Boolean,
});

/**
 * A built-in column or active custom field available for search (§7.2), with the
 * operators Core allows for it in display order.
 */
export const SearchableField = Schema.Struct({
  key: Schema.String,
  displayName: Schema.String,
  dataType: FieldDataType,
  fieldDefinitionId: Schema.NullOr(Guid),
  operators: Schema.Array(FilterOperator),
});

/** A selectable option for a choice search filter. */
export const SearchChoice = Schema.Struct({
  id: Guid,
  label: Schema.String,
  sortOrder: Schema.Int,
  name: Schema.NullOr(Schema.String),
  number: Schema.NullOr(Schema.Int),
});

/** A compact item row returned by search, with resolved location and display labels. */
export const ItemSearchResult = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  projectName: Schema.String,
  folderId: Schema.NullOr(Guid),
  parentItemId: Schema.NullOr(Guid),
  title: Schema.String,
  ticketNumber: Schema.NullOr(Schema.String),
  priorityLevelId: Schema.NullOr(Guid),
  statusId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(IsoDate),
  dueTime: Schema.NullOr(IsoTime),
  isCompleted: Schema.Boolean,
  location: Schema.Array(Schema.String),
  priorityLabel: Schema.NullOr(Schema.String),
  statusName: Schema.NullOr(Schema.String),
});

/** A bounded page of search results. */
export const ItemSearchResults = Schema.Struct({
  items: Schema.Array(ItemSearchResult),
  hasMore: Schema.Boolean,
});

/** Current live location of an item when activating a search result. */
export const SearchItemLocation = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
});
