using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core.Search;

namespace TaskTracker.Infrastructure.Persistence.Migrations;

/// <summary>Adds the item full-text index and its transaction-local maintenance triggers.</summary>
[DbContext(typeof(TaskTrackerDbContext))]
[Migration("20261114120000_AddItemSearch")]
public sealed class AddItemSearch : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        RenameReservedKeys(migrationBuilder);
        // The mapping's INTEGER PRIMARY KEY keeps FTS rowids stable through VACUUM
        // and EF table rebuilds; TodoItem's implicit rowid has no such guarantee.
        migrationBuilder.Sql("CREATE TABLE TodoItemSearchRow ("
            + "RowId INTEGER PRIMARY KEY AUTOINCREMENT, "
            + "ItemId TEXT NOT NULL UNIQUE REFERENCES TodoItem(Id) ON DELETE CASCADE)");
        migrationBuilder.Sql("CREATE VIRTUAL TABLE TodoItemSearch USING fts5(Title, Description, TicketNumber, "
            + "tokenize='unicode61 remove_diacritics 2')");
        migrationBuilder.Sql("CREATE TRIGGER TodoItemSearch_Insert AFTER INSERT ON TodoItem BEGIN "
            + "INSERT INTO TodoItemSearchRow(ItemId) VALUES (new.Id); "
            + "INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber) "
            + "VALUES (last_insert_rowid(), new.Title, new.Description, new.TicketNumber); END");
        migrationBuilder.Sql("CREATE TRIGGER TodoItemSearch_Delete AFTER DELETE ON TodoItem BEGIN "
            + "DELETE FROM TodoItemSearch WHERE rowid = "
            + "(SELECT RowId FROM TodoItemSearchRow WHERE ItemId = old.Id); "
            + "DELETE FROM TodoItemSearchRow WHERE ItemId = old.Id; END");
        // SQLite may cascade the mapping row before TodoItem's AFTER DELETE trigger.
        migrationBuilder.Sql("CREATE TRIGGER TodoItemSearchRow_Delete AFTER DELETE ON TodoItemSearchRow BEGIN "
            + "DELETE FROM TodoItemSearch WHERE rowid = old.RowId; END");
        migrationBuilder.Sql("CREATE TRIGGER TodoItemSearch_Update "
            + "AFTER UPDATE OF Title, Description, TicketNumber ON TodoItem BEGIN "
            + "DELETE FROM TodoItemSearch WHERE rowid = "
            + "(SELECT RowId FROM TodoItemSearchRow WHERE ItemId = new.Id); "
            + "INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber) "
            + "SELECT RowId, new.Title, new.Description, new.TicketNumber "
            + "FROM TodoItemSearchRow WHERE ItemId = new.Id; END");
        migrationBuilder.Sql("INSERT INTO TodoItemSearchRow(ItemId) SELECT Id FROM TodoItem");
        migrationBuilder.Sql("INSERT INTO TodoItemSearch(rowid, Title, Description, TicketNumber) "
            + "SELECT mapping.RowId, item.Title, item.Description, item.TicketNumber "
            + "FROM TodoItem item JOIN TodoItemSearchRow mapping ON mapping.ItemId = item.Id");
    }

    private static void RenameReservedKeys(MigrationBuilder migrationBuilder)
    {
        foreach (var key in BuiltInSearchKeys.All)
        {
            var sql = $"""
                WITH RECURSIVE candidates(suffix, candidate) AS (
                    SELECT 2, '{key}-2'
                    UNION ALL
                    SELECT suffix + 1, '{key}-' || (suffix + 1)
                    FROM candidates
                    WHERE EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidates.candidate)
                )
                UPDATE FieldDefinition
                SET Key = (SELECT candidate FROM candidates
                    WHERE NOT EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidates.candidate)
                    LIMIT 1)
                WHERE Key = '{key}'
                """;
            migrationBuilder.Sql(sql);
        }
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TRIGGER TodoItemSearch_Update");
        migrationBuilder.Sql("DROP TRIGGER TodoItemSearch_Delete");
        migrationBuilder.Sql("DROP TRIGGER TodoItemSearch_Insert");
        migrationBuilder.Sql("DROP TRIGGER TodoItemSearchRow_Delete");
        migrationBuilder.Sql("DROP TABLE TodoItemSearch");
        migrationBuilder.Sql("DROP TABLE TodoItemSearchRow");
    }
}