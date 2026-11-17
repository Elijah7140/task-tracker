using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecurrence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            RenameRepeatsKey(migrationBuilder);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceAnchor",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "RecurrenceEndDate",
                table: "TodoItem",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceEndKind",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceFrequency",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceInterval",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceMonth",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceMonthDay",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceRemaining",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RecurrenceSeriesId",
                table: "TodoItem",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RecurrenceWeekdays",
                table: "TodoItem",
                type: "INTEGER",
                nullable: true);
        }

        /// <summary>"repeats" is now a built-in search key; an existing custom field with that key gets the first free numeric suffix.</summary>
        private static void RenameRepeatsKey(MigrationBuilder migrationBuilder)
        {
            const string candidate = """
                WITH RECURSIVE candidates(suffix, candidate) AS (
                    SELECT 2, 'repeats-2'
                    UNION ALL
                    SELECT suffix + 1, 'repeats-' || (suffix + 1)
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
                SET QueryText = tt_rename_query_field(QueryText, 'repeats', (SELECT Key FROM renamed))
                FROM FieldDefinition AS legacy
                WHERE legacy.Key = 'repeats' COLLATE NOCASE
                    AND (legacy.ProjectId IS NULL OR SavedSearch.ScopeKind = 'AllProjects'
                        OR SavedSearch.ProjectId = legacy.ProjectId)
                """);
            migrationBuilder.Sql($"""
                {candidate}
                UPDATE FieldDefinition
                SET Key = (SELECT Key FROM renamed)
                WHERE Key = 'repeats' COLLATE NOCASE
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Native DROP COLUMN preserves the search triggers attached to TodoItem.
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceAnchor");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceEndDate");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceEndKind");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceFrequency");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceInterval");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceMonth");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceMonthDay");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceRemaining");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceSeriesId");
            migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN RecurrenceWeekdays");
        }
    }
}