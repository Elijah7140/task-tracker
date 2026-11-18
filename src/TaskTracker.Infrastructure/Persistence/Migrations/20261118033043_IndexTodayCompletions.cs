using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class IndexTodayCompletions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_CompletedAtUtc",
                table: "TodoItem",
                column: "CompletedAtUtc",
                filter: "CompletedAtUtc IS NOT NULL AND DeletedAtUtc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TodoItem_CompletedAtUtc",
                table: "TodoItem");
        }
    }
}