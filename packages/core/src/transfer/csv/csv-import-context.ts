import type { FieldChoice } from "../../fields/field-choice.js";
import type { FieldDefinition } from "../../fields/field-definition.js";
import type { ItemType } from "../../lookups/item-type.js";
import type { PriorityLevel } from "../../lookups/priority-level.js";
import type { StatusLevel } from "../../lookups/status-level.js";
import type { TicketListEntry } from "../../tickets/ticket-list-entry.js";

/** What a CSV import matches cells against: the lookups and the target project's fields. */
export interface CsvImportContext {
  /** Every item type, archived ones included, in stored order. */
  readonly itemTypes: readonly ItemType[];
  /** Every priority level, archived ones included, in stored order. */
  readonly priorityLevels: readonly PriorityLevel[];
  /** Every status, archived ones included, in stored order. */
  readonly statuses: readonly StatusLevel[];
  /** The active fields the project's items can hold, global and its own, in stored order. */
  readonly fields: readonly FieldDefinition[];
  /** Every choice in stored order; only active ones match. */
  readonly choices: readonly FieldChoice[];
  /** People, ticket types and levels, archived ones included (§7.19). */
  readonly ticketLists: readonly TicketListEntry[];
}

/** The active global fields and the project's own active fields, keeping stored order. */
export function csvImportFields(
  definitions: readonly FieldDefinition[],
  projectId: string,
): FieldDefinition[] {
  return definitions.filter(
    (field) => !field.isArchived && (field.projectId === null || field.projectId === projectId),
  );
}
