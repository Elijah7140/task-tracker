using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
public partial class AddReminders : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        RenameReminderKey(migrationBuilder);

        migrationBuilder.AddColumn<long>(
            name: "ReminderDeliveredFor",
            table: "TodoItem",
            type: "INTEGER",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "ReminderMode",
            table: "TodoItem",
            type: "INTEGER",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "ReminderOffsetMinutes",
            table: "TodoItem",
            type: "INTEGER",
            nullable: true);

        migrationBuilder.AddColumn<long>(
            name: "SnoozedForUtc",
            table: "TodoItem",
            type: "INTEGER",
            nullable: true);

        migrationBuilder.AddColumn<long>(
            name: "SnoozedUntilUtc",
            table: "TodoItem",
            type: "INTEGER",
            nullable: true);
    }

    private static void RenameReminderKey(MigrationBuilder migrationBuilder)
    {
        const string candidate = """
            WITH RECURSIVE candidates(suffix, candidate) AS (
                SELECT 2, 'reminder-2'
                UNION ALL
                SELECT suffix + 1, 'reminder-' || (suffix + 1)
                FROM candidates
                WHERE EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidates.candidate COLLATE NOCASE)
            ),
            renamed(Key) AS (
                SELECT candidate FROM candidates
                WHERE NOT EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidates.candidate COLLATE NOCASE)
                LIMIT 1
            )
            """;
        migrationBuilder.Sql($"""
            {candidate}
            UPDATE SavedSearch
            SET QueryText = tt_rename_query_field(QueryText, 'reminder', (SELECT Key FROM renamed))
            FROM FieldDefinition AS legacy
            WHERE legacy.Key = 'reminder' COLLATE NOCASE
                AND (legacy.ProjectId IS NULL OR SavedSearch.ScopeKind = 'AllProjects'
                    OR SavedSearch.ProjectId = legacy.ProjectId)
            """);
        migrationBuilder.Sql($"""
            {candidate}
            UPDATE FieldDefinition
            SET Key = (SELECT Key FROM renamed)
            WHERE Key = 'reminder' COLLATE NOCASE
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Native DROP COLUMN preserves the FTS triggers attached to TodoItem.
        migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN ReminderDeliveredFor");
        migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN ReminderMode");
        migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN ReminderOffsetMinutes");
        migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN SnoozedForUtc");
        migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN SnoozedUntilUtc");
    }
}