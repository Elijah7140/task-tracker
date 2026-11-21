import type { FieldChoice } from "../../fields/field-choice.js";
import type { FieldDefinition } from "../../fields/field-definition.js";
import type { ItemFieldValue } from "../../fields/item-field-value.js";
import type { ItemLink } from "../../items/item-link.js";
import type { TodoItem } from "../../items/todo-item.js";
import type { ItemType } from "../../lookups/item-type.js";
import type { PriorityLevel } from "../../lookups/priority-level.js";
import type { StatusLevel } from "../../lookups/status-level.js";
import type { Folder } from "../../projects/folder.js";
import type { Project } from "../../projects/project.js";
import type { TicketComment } from "../../tickets/ticket-comment.js";
import type { TicketDetail } from "../../tickets/ticket-detail.js";
import type { TicketListEntry } from "../../tickets/ticket-list-entry.js";

/** Every lookup, field definition and choice, each list in stored order (sort order, then row). */
export interface ExportCatalogue {
  readonly itemTypes: readonly ItemType[];
  readonly priorityLevels: readonly PriorityLevel[];
  readonly statuses: readonly StatusLevel[];
  readonly fields: readonly FieldDefinition[];
  readonly choices: readonly FieldChoice[];
  /** People, ticket types and levels (§7.19). */
  readonly ticketLists: readonly TicketListEntry[];
}

/** The active rows of one project. */
export interface ProjectExportData {
  readonly project: Project;
  readonly folders: readonly Folder[];
  readonly items: readonly TodoItem[];
  readonly values: readonly ItemFieldValue[];
  readonly links: readonly ItemLink[];
  /** The tickets' fixed fields and comment logs (§7.19). */
  readonly ticketDetails: readonly TicketDetail[];
  readonly comments: readonly TicketComment[];
  readonly settings: ReadonlyMap<string, string>;
}

/** A saved search exactly as stored, scope columns included. */
export interface SavedSearchRow {
  readonly id: string;
  readonly name: string;
  readonly queryText: string;
  readonly scopeKind: string;
  readonly projectId: string | null;
  readonly folderId: string | null;
  readonly includeSubfolders: boolean;
  readonly includeCompleted: boolean;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}

/** Everything one export reads, loaded in one transaction. */
export interface ExportSource {
  /** True for a whole-database export, false for one project. */
  readonly wholeDatabase: boolean;
  readonly exportedAtUtc: Temporal.Instant;
  readonly catalogue: ExportCatalogue;
  /** The exported projects in stored order. */
  readonly projects: readonly ProjectExportData[];
  readonly globalSettings: ReadonlyMap<string, string>;
  /** Every saved search in stored order. */
  readonly savedSearches: readonly SavedSearchRow[];
}
