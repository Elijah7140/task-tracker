import type {
  RecurrenceAnchor,
  RecurrenceEndKind,
  RecurrenceFrequency,
} from "../../items/recurrence/recurrence-rule.js";

/*
 * The documents of a version 1 JSON export (§7.9) as the importer reads them. Every
 * property may be missing so that a missing value becomes an issue with a path.
 * Missing and null both read as null. GUIDs are uppercase.
 */

/** The value of `format` in every export. */
export const EXPORT_FORMAT_NAME = "task-tracker";

/** The only document version this application writes and reads. */
export const EXPORT_FORMAT_VERSION = 1;

/** A list read from the file. A `null` element stays null until the null-element check. */
export type DocumentList<T> = ReadonlyArray<T | null> | null;

/** An item type, priority level or status. */
export interface LookupDocument {
  readonly id: string | null;
  readonly name: string | null;
  /** A priority level's number label; such a level may have an empty name. */
  readonly number: number | null;
  /** A status's kind: "open" or "done". */
  readonly kind: string | null;
  readonly colorKey: string | null;
  readonly iconKey: string | null;
  readonly isBuiltIn: boolean | null;
  readonly isArchived: boolean | null;
  readonly sortOrder: number | null;
}

/** One option of a choice field. */
export interface ChoiceDocument {
  readonly id: string | null;
  readonly label: string | null;
  readonly sortOrder: number | null;
  readonly isArchived: boolean | null;
}

/** A custom field definition; `projectId` is null for a global field. */
export interface FieldDocument {
  readonly id: string | null;
  readonly key: string | null;
  readonly displayName: string | null;
  readonly dataType: string | null;
  readonly projectId: string | null;
  readonly isArchived: boolean | null;
  readonly sortOrder: number | null;
  readonly choices: DocumentList<ChoiceDocument>;
}

/** One custom value; exactly one typed value is set. */
export interface FieldValueDocument {
  readonly fieldKey: string | null;
  readonly text: string | null;
  readonly number: number | null;
  readonly date: string | null;
  readonly boolean: boolean | null;
  readonly choiceId: string | null;
  readonly choiceLabel: string | null;
}

/** One link of an item; its position in the list is its order. */
export interface ItemLinkDocument {
  readonly url: string | null;
  readonly title: string | null;
}

/**
 * A repeat rule as read. A missing or unknown enum value reads as null, as the
 * legacy reader's default value did, so validation reports it.
 */
export interface RecurrenceDocument {
  readonly frequency: RecurrenceFrequency | null;
  readonly interval: number;
  readonly weekdays: number | null;
  readonly monthDay: number | null;
  readonly month: number | null;
  readonly anchor: RecurrenceAnchor | null;
  readonly endKind: RecurrenceEndKind | null;
  readonly endDate: Temporal.PlainDate | null;
  readonly remaining: number | null;
}

/** The legacy `ReminderMode` names. */
export type ReminderModeName = "none" | "offset";

/** One ticket list entry (§7.19); `parentId` names the level above, when there is one. */
export interface TicketListEntryDocument {
  readonly id: string | null;
  readonly listKind: string | null;
  readonly parentId: string | null;
  readonly name: string | null;
  readonly isArchived: boolean | null;
  readonly sortOrder: number | null;
}

/** A ticket's fixed fields; list references are entry ids from `ticketLists` (§7.19). */
export interface TicketDocument {
  readonly requestorId: string | null;
  readonly applicationId: string | null;
  readonly moduleId: string | null;
  readonly interfaceId: string | null;
  readonly dispatchedToId: string | null;
  readonly pendingPersonId: string | null;
  readonly ticketTypeId: string | null;
}

/** One entry of a ticket's comment log. */
export interface CommentDocument {
  readonly body: string | null;
  readonly createdAtUtc: string | null;
}

/** An item or sub-item. */
export interface ItemDocument {
  readonly id: string | null;
  readonly folderId: string | null;
  readonly parentItemId: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly ticketNumber: string | null;
  readonly itemTypeId: string | null;
  readonly itemType: string | null;
  readonly priorityLevelId: string | null;
  readonly priority: string | null;
  readonly statusId: string | null;
  readonly reopenStatusId: string | null;
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly completedAtUtc: string | null;
  readonly sortOrder: number | null;
  readonly createdAtUtc: string | null;
  readonly updatedAtUtc: string | null;
  readonly fieldValues: DocumentList<FieldValueDocument>;
  readonly reminderMode: ReminderModeName | null;
  readonly reminderOffsetMinutes: number | null;
  readonly recurrence: RecurrenceDocument | null;
  readonly recurrenceSeriesId: string | null;
  readonly recurrenceSuccessorCreated: boolean;
  readonly links: DocumentList<ItemLinkDocument>;
  /** "Ticket" for a ticket; missing or null reads as a ToDo (§7.19). */
  readonly kind: string | null;
  readonly ticket: TicketDocument | null;
  readonly comments: DocumentList<CommentDocument>;
}

/** A folder; `parentFolderId` is null for a top-level folder. */
export interface FolderDocument {
  readonly id: string | null;
  readonly parentFolderId: string | null;
  readonly name: string | null;
  readonly sortOrder: number | null;
  readonly createdAtUtc: string | null;
  readonly updatedAtUtc: string | null;
}

/** Setting text by key. A `null` value is kept so validation can report it. */
export type SettingsDocument = ReadonlyMap<string, string | null>;

/** A project with its folders, items and setting overrides. */
export interface ProjectDocument {
  readonly id: string | null;
  readonly name: string | null;
  readonly description: string | null;
  /** The project's icon key (§7.19), or null for its initial. */
  readonly iconKey: string | null;
  readonly sortOrder: number | null;
  readonly createdAtUtc: string | null;
  readonly updatedAtUtc: string | null;
  readonly settings: SettingsDocument | null;
  readonly folders: DocumentList<FolderDocument>;
  readonly items: DocumentList<ItemDocument>;
}

/** A saved search in its stored form, with choices written as `#id`. */
export interface SavedSearchDocument {
  readonly id: string | null;
  readonly name: string | null;
  readonly queryText: string | null;
  readonly scopeKind: string | null;
  readonly projectId: string | null;
  readonly folderId: string | null;
  readonly includeSubfolders: boolean | null;
  readonly includeCompleted: boolean | null;
  readonly sortOrder: number | null;
  readonly createdAtUtc: string | null;
  readonly updatedAtUtc: string | null;
}

/** The root of a JSON export. */
export interface ExportDocument {
  readonly format: string | null;
  readonly version: number | null;
  readonly exportedAtUtc: string | null;
  readonly scope: string | null;
  readonly itemTypes: DocumentList<LookupDocument>;
  readonly priorityLevels: DocumentList<LookupDocument>;
  readonly statuses: DocumentList<LookupDocument>;
  readonly fields: DocumentList<FieldDocument>;
  readonly globalSettings: SettingsDocument | null;
  readonly projects: DocumentList<ProjectDocument>;
  readonly savedSearches: DocumentList<SavedSearchDocument>;
  /** People, ticket types and ticket levels (§7.19); missing in files from older versions. */
  readonly ticketLists: DocumentList<TicketListEntryDocument>;
}

/** A list that may be missing from the file, read as empty, after the null-element check. */
export function listOf<T>(list: DocumentList<T>): readonly T[] {
  return (list ?? []) as readonly T[];
}
