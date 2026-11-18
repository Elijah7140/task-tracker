using Microsoft.EntityFrameworkCore.Migrations;

namespace TaskTracker.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
public partial class AddStatusesAndPriorityNumbers : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        AddLookupColumns(migrationBuilder);
        AddItemStatusColumns(migrationBuilder);
        AddStatusChecks(migrationBuilder);
        RewriteSearchKeys(migrationBuilder);
    }

    private static void AddLookupColumns(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE PriorityLevel ADD COLUMN Number INTEGER
                CONSTRAINT CK_PriorityLevel_Number CHECK (Number IS NULL OR (typeof(Number) = 'integer' AND Number >= 1));
            DROP INDEX IX_PriorityLevel_Name;
            CREATE UNIQUE INDEX IX_PriorityLevel_Name ON PriorityLevel (Name) WHERE Name <> '';
            CREATE UNIQUE INDEX IX_PriorityLevel_Number ON PriorityLevel (Number)
                WHERE Number IS NOT NULL AND IsArchived = 0;

            CREATE TABLE StatusLevel (
                Id TEXT NOT NULL CONSTRAINT PK_StatusLevel PRIMARY KEY,
                Kind INTEGER NOT NULL CONSTRAINT CK_StatusLevel_Kind CHECK (Kind IN (0, 1)),
                Name TEXT NOT NULL COLLATE NOCASE,
                ColorKey TEXT NULL,
                IsBuiltIn INTEGER NOT NULL,
                IsArchived INTEGER NOT NULL,
                SortOrder INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IX_StatusLevel_Name ON StatusLevel (Name);
            INSERT INTO StatusLevel (Id, Kind, Name, IsBuiltIn, IsArchived, SortOrder) VALUES
                ('019A0000-0000-7000-8000-000000000201', 0, 'Queued', 0, 0, 0),
                ('019A0000-0000-7000-8000-000000000202', 0, 'In progress', 0, 0, 1),
                ('019A0000-0000-7000-8000-000000000203', 0, 'Testing', 0, 0, 2),
                ('019A0000-0000-7000-8000-000000000204', 1, 'Completed', 0, 0, 3);
            """);
    }

    private static void AddItemStatusColumns(MigrationBuilder migrationBuilder)
    {
        // Inline nullable references allow SQLite to add the columns without rebuilding the FTS source table.
        migrationBuilder.Sql("""
            ALTER TABLE TodoItem ADD COLUMN StatusId TEXT NULL REFERENCES StatusLevel (Id) ON DELETE RESTRICT;
            ALTER TABLE TodoItem ADD COLUMN ReopenStatusId TEXT NULL REFERENCES StatusLevel (Id) ON DELETE RESTRICT;
            CREATE INDEX IX_TodoItem_StatusId ON TodoItem (StatusId);
            CREATE INDEX IX_TodoItem_ReopenStatusId ON TodoItem (ReopenStatusId);
            UPDATE TodoItem SET StatusId = '019A0000-0000-7000-8000-000000000204' WHERE CompletedAtUtc IS NOT NULL;
            """);
    }

    private static void AddStatusChecks(MigrationBuilder migrationBuilder)
    {
        const string inconsistent = """
            (NEW.CompletedAtUtc IS NOT NULL) <>
                EXISTS (SELECT 1 FROM StatusLevel WHERE Id = NEW.StatusId AND Kind = 1)
            OR (NEW.ReopenStatusId IS NOT NULL AND (NEW.CompletedAtUtc IS NULL OR
                NOT EXISTS (SELECT 1 FROM StatusLevel WHERE Id = NEW.ReopenStatusId AND Kind = 0)))
            """;

        migrationBuilder.Sql($"""
            CREATE TRIGGER TodoItem_Status_Insert BEFORE INSERT ON TodoItem
            WHEN {inconsistent}
            BEGIN SELECT RAISE(ABORT, 'Item status must agree with completion'); END;
            CREATE TRIGGER TodoItem_Status_Update BEFORE UPDATE OF StatusId, ReopenStatusId, CompletedAtUtc ON TodoItem
            WHEN {inconsistent}
            BEGIN SELECT RAISE(ABORT, 'Item status must agree with completion'); END;
            CREATE TRIGGER StatusLevel_Kind_Update BEFORE UPDATE OF Kind ON StatusLevel
            WHEN NEW.Kind <> OLD.Kind
            BEGIN SELECT RAISE(ABORT, 'Status kind cannot change'); END;
            CREATE TRIGGER StatusLevel_LastDone_Update BEFORE UPDATE OF IsArchived ON StatusLevel
            WHEN NEW.IsArchived = 1 AND OLD.IsArchived = 0 AND OLD.Kind = 1
                AND NOT EXISTS (SELECT 1 FROM StatusLevel WHERE Kind = 1 AND IsArchived = 0 AND Id <> OLD.Id)
            BEGIN SELECT RAISE(ABORT, 'At least one Done status must stay active'); END;
            CREATE TRIGGER StatusLevel_LastDone_Delete BEFORE DELETE ON StatusLevel
            WHEN OLD.IsArchived = 0 AND OLD.Kind = 1
                AND NOT EXISTS (SELECT 1 FROM StatusLevel WHERE Kind = 1 AND IsArchived = 0 AND Id <> OLD.Id)
            BEGIN SELECT RAISE(ABORT, 'At least one Done status must stay active'); END;
            """);
    }

    private static void RewriteSearchKeys(MigrationBuilder migrationBuilder)
    {
        const string candidate = """
            WITH RECURSIVE candidates(suffix, candidate) AS (
                SELECT 2, 'completed-2'
                UNION ALL
                SELECT suffix + 1, 'completed-' || (suffix + 1)
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
            SET QueryText = tt_rename_query_field(QueryText, 'completed', (SELECT Key FROM renamed))
            FROM FieldDefinition AS legacy
            WHERE legacy.Key = 'completed' COLLATE NOCASE
                AND (legacy.ProjectId IS NULL OR SavedSearch.ScopeKind = 'AllProjects'
                    OR SavedSearch.ProjectId = legacy.ProjectId);
            """);
        migrationBuilder.Sql($"""
            {candidate}
            UPDATE FieldDefinition SET Key = (SELECT Key FROM renamed) WHERE Key = 'completed' COLLATE NOCASE;
            UPDATE SavedSearch SET QueryText = tt_rename_query_field(QueryText, 'status', 'completed');
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TRIGGER TodoItem_Status_Insert;
            DROP TRIGGER TodoItem_Status_Update;
            DROP TRIGGER StatusLevel_Kind_Update;
            DROP TRIGGER StatusLevel_LastDone_Update;
            DROP TRIGGER StatusLevel_LastDone_Delete;
            DROP INDEX IX_TodoItem_StatusId;
            DROP INDEX IX_TodoItem_ReopenStatusId;
            ALTER TABLE TodoItem DROP COLUMN StatusId;
            ALTER TABLE TodoItem DROP COLUMN ReopenStatusId;
            DROP TABLE StatusLevel;
            DROP INDEX IX_PriorityLevel_Number;
            DROP INDEX IX_PriorityLevel_Name;
            UPDATE PriorityLevel SET Name = Id WHERE Name = '';
            ALTER TABLE PriorityLevel DROP COLUMN Number;
            CREATE UNIQUE INDEX IX_PriorityLevel_Name ON PriorityLevel (Name);
            UPDATE SavedSearch SET QueryText = tt_rename_query_field(QueryText, 'completed', 'status');
            """);
    }
}