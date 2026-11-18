using Microsoft.EntityFrameworkCore.Migrations;

namespace TaskTracker.Infrastructure.Persistence.Migrations;

/// <summary>Adds the ticket position without rebuilding TodoItem or its FTS triggers.</summary>
public partial class AddTicketRank : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<double>(
            name: "TicketRank",
            table: "TodoItem",
            type: "REAL",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE TodoItem DROP COLUMN TicketRank;");
    }
}