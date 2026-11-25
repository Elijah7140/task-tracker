import { Effect } from "effect";
import { readRows, type TransferWorld } from "./transfer-world.js";

/** How many rows each table holds, deleted rows included; equal counts mean nothing changed. */
export const countRows = (world: TransferWorld) =>
  Effect.gen(function* () {
    const tables = [
      "Project",
      "Folder",
      "TodoItem",
      "PriorityLevel",
      "StatusLevel",
      "FieldDefinition",
      "FieldChoice",
      "ItemFieldValue",
      "ItemLink",
      "SavedSearch",
      "ProjectSetting",
    ];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const [row] = yield* readRows<{ count: number }>(
        world,
        `SELECT COUNT(*) AS count FROM ${table}`,
      );
      counts[table] = row!.count;
    }
    return counts;
  });

/** A stored project row. */
export interface ProjectRow {
  readonly Id: string;
  readonly Name: string;
  readonly SortOrder: number;
}

/** Active projects in display order. */
export const readProjects = (world: TransferWorld) =>
  readRows<ProjectRow>(
    world,
    "SELECT Id, Name, SortOrder FROM Project WHERE DeletedAtUtc IS NULL ORDER BY SortOrder, rowid",
  );

/** The active project with this name. */
export const projectId = (world: TransferWorld, name: string) =>
  Effect.map(
    readProjects(world),
    (projects) => projects.find((project) => project.Name === name)!.Id,
  );

/** A stored item row with the columns tests read. */
export interface ItemRowValues {
  readonly Id: string;
  readonly ProjectId: string;
  readonly FolderId: string | null;
  readonly ParentItemId: string | null;
  readonly Title: string;
  readonly Description: string | null;
  readonly TicketNumber: string | null;
  readonly TicketRank: number | null;
  readonly PriorityLevelId: string | null;
  readonly StatusId: string | null;
  readonly ReopenStatusId: string | null;
  readonly DueDate: string | null;
  readonly DueTime: string | null;
  readonly CompletedAtUtc: string | null;
  readonly SortOrder: number;
  readonly CreatedAtUtc: string;
  readonly UpdatedAtUtc: string;
  readonly RecurrenceFrequency: number | null;
  readonly RecurrenceRemaining: number | null;
  readonly RecurrenceSeriesId: string | null;
  readonly RecurrenceSuccessorCreated: number;
  readonly ReminderMode: number | null;
  readonly ReminderOffsetMinutes: number | null;
  readonly DeletedAtUtc: string | null;
}

/** Every item of a project, deleted ones included, in sort order. */
export const readItems = (world: TransferWorld, project: string) =>
  readRows<ItemRowValues>(
    world,
    "SELECT * FROM TodoItem WHERE ProjectId = ? ORDER BY SortOrder, rowid",
    project,
  );

/** The item with this title in a project. */
export const itemNamed = (world: TransferWorld, project: string, title: string) =>
  Effect.map(readItems(world, project), (items) => items.find((item) => item.Title === title)!);

/** A stored field definition. */
export interface FieldRowValues {
  readonly Id: string;
  readonly Key: string;
  readonly DisplayName: string;
  readonly DataType: string;
  readonly ProjectId: string | null;
  readonly IsArchived: number;
  readonly SortOrder: number;
}

/** Every field definition in sort order. */
export const readFields = (world: TransferWorld) =>
  readRows<FieldRowValues>(world, "SELECT * FROM FieldDefinition ORDER BY SortOrder, rowid");

/** A field's choices in sort order. */
export const readChoices = (world: TransferWorld, fieldId: string) =>
  readRows<{ Id: string; Label: string; IsArchived: number; SortOrder: number }>(
    world,
    "SELECT * FROM FieldChoice WHERE FieldDefinitionId = ? ORDER BY SortOrder, rowid",
    fieldId,
  );

/** An item's custom values. */
export const readValues = (world: TransferWorld, itemId: string) =>
  readRows<{
    FieldDefinitionId: string;
    TextValue: string | null;
    NumberValue: number | null;
    DateValue: string | null;
    BoolValue: number | null;
    ChoiceId: string | null;
  }>(world, "SELECT * FROM ItemFieldValue WHERE ItemId = ? ORDER BY rowid", itemId);

/** Every saved search. */
export const readSavedSearches = (world: TransferWorld) =>
  readRows<{
    Id: string;
    Name: string;
    QueryText: string;
    ScopeKind: string;
    ProjectId: string | null;
    FolderId: string | null;
  }>(world, "SELECT * FROM SavedSearch ORDER BY SortOrder, rowid");

/** A lookup table's rows in sort order. */
export const readLookups = (world: TransferWorld, table: "PriorityLevel" | "StatusLevel") =>
  readRows<{
    Id: string;
    Name: string;
    IsArchived: number;
    SortOrder: number;
    Number?: number | null;
    Kind?: number;
  }>(world, `SELECT * FROM ${table} ORDER BY SortOrder, rowid`);

/** A project's stored overrides. */
export const readProjectSettings = (world: TransferWorld, project: string) =>
  Effect.map(
    readRows<{ Key: string; Value: string }>(
      world,
      "SELECT Key, Value FROM ProjectSetting WHERE ProjectId = ?",
      project,
    ),
    (rows) => Object.fromEntries(rows.map((row) => [row.Key, row.Value])),
  );

/** The built-in lookup IDs. */
export const BUILT_IN = {
  change: "019A0000-0000-7000-8000-000000000001",
  high: "019A0000-0000-7000-8000-000000000102",
  completed: "019A0000-0000-7000-8000-000000000204",
} as const;
