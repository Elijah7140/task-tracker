import type { FieldChoice } from "../fields/field-choice.js";
import type { FieldDataType } from "../fields/field-data-type.js";
import type { FieldDefinition } from "../fields/field-definition.js";
import type { ItemType } from "../lookups/item-type.js";
import { priorityLabel, type PriorityLevel } from "../lookups/priority-level.js";
import type { Project } from "../projects/project.js";
import { scopeProjectId, type SearchScope } from "./search-scope.js";
import {
  isBuiltInSearchField,
  type SearchableField,
  type SearchChoice,
} from "./searchable-field.js";

function builtInField(key: string, displayName: string, dataType: FieldDataType): SearchableField {
  return {
    key,
    displayName,
    dataType,
    fieldDefinitionId: null,
    source: { kind: "builtIn", column: key },
  };
}

function customField(definition: FieldDefinition): SearchableField {
  return {
    key: definition.key,
    displayName: definition.displayName,
    dataType: definition.dataType,
    fieldDefinitionId: definition.id,
    source: { kind: "custom", fieldDefinitionId: definition.id },
  };
}

/**
 * The item kind and the fixed ticket fields (§7.19). People, levels and ticket types match by
 * entry name; a ToDo has no ticket fields, so it matches only IsEmpty.
 */
export const TICKET_SEARCH_FIELDS: ReadonlyArray<SearchableField> = [
  builtInField("kind", "Kind", "Text"),
  builtInField("requestor", "Requestor", "Text"),
  builtInField("dispatched", "Dispatched To", "Text"),
  builtInField("pending", "Pending User", "Text"),
  builtInField("application", "Application", "Text"),
  builtInField("module", "Module", "Text"),
  builtInField("interface", "Interface", "Text"),
  builtInField("tickettype", "Ticket Type", "Text"),
  builtInField("comment", "Comments", "Text"),
];

/** Built-in item columns exposed by the search field registry (§7.2). */
export const BUILT_IN_SEARCH_FIELDS: ReadonlyArray<SearchableField> = [
  builtInField("title", "Title", "Text"),
  builtInField("ticket", "Ticket Number", "Text"),
  builtInField("type", "Type", "Choice"),
  builtInField("priority", "Priority", "Choice"),
  builtInField("due", "Due Date", "Date"),
  builtInField("scheduled", "Scheduled Date", "Date"),
  builtInField("status", "Status", "Text"),
  builtInField("completed", "Completed", "Boolean"),
  builtInField("link", "Links", "Text"),
  builtInField("repeats", "Repeats", "Boolean"),
  builtInField("reminder", "Reminder", "Boolean"),
  ...TICKET_SEARCH_FIELDS,
];

/** Active lookup and custom choice rows used to populate choice search filters. */
export interface SearchChoiceSources {
  readonly itemTypes: ReadonlyArray<ItemType>;
  readonly priorityLevels: ReadonlyArray<PriorityLevel>;
  readonly choices: ReadonlyArray<FieldChoice>;
}

/**
 * Lists built-in fields, then active global custom fields, then active project
 * custom fields in project sort order for `scope` (§7.2).
 */
export function listSearchableFields(
  scope: SearchScope,
  definitions: ReadonlyArray<FieldDefinition>,
  projects: ReadonlyArray<Project>,
): ReadonlyArray<SearchableField> {
  const targetProjectId = scopeProjectId(scope);
  const projectOrder = new Map(
    projects
      .filter((project) => project.deletedAtUtc === null)
      .map((project) => [project.id, project.sortOrder]),
  );

  const globals = definitions
    .filter((field) => !field.isArchived && field.projectId === null)
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
    );

  const locals = definitions
    .filter(
      (field) =>
        !field.isArchived &&
        field.projectId !== null &&
        projectOrder.has(field.projectId) &&
        (targetProjectId === null || field.projectId === targetProjectId),
    )
    .toSorted(
      (left, right) =>
        projectOrder.get(left.projectId!)! - projectOrder.get(right.projectId!)! ||
        left.sortOrder - right.sortOrder ||
        left.key.localeCompare(right.key),
    );

  return [...BUILT_IN_SEARCH_FIELDS, ...globals.map(customField), ...locals.map(customField)];
}

/** Returns the active selectable choices for `field` in display order (§7.2). */
export function listSearchChoices(
  field: SearchableField,
  sources: SearchChoiceSources,
): ReadonlyArray<SearchChoice> {
  if (isBuiltInSearchField(field) && field.key === "type") {
    return sources.itemTypes
      .filter((type) => !type.isArchived)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((type) => ({
        id: type.id,
        label: type.name,
        sortOrder: type.sortOrder,
        name: null,
        number: null,
      }));
  }

  if (isBuiltInSearchField(field) && field.key === "priority") {
    return sources.priorityLevels
      .filter((level) => !level.isArchived)
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((level) => ({
        id: level.id,
        label: priorityLabel(level),
        sortOrder: level.sortOrder,
        name: level.name,
        number: level.number,
      }));
  }

  if (field.fieldDefinitionId === null || field.dataType !== "Choice") {
    return [];
  }

  return sources.choices
    .filter((choice) => choice.fieldDefinitionId === field.fieldDefinitionId && !choice.isArchived)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((choice) => ({
      id: choice.id,
      label: choice.label,
      sortOrder: choice.sortOrder,
      name: null,
      number: null,
    }));
}
