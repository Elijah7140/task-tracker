using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSavedSearches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            RenameKeywordKeys(migrationBuilder);

            migrationBuilder.CreateTable(
                name: "SavedSearch",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false, collation: "NOCASE"),
                    QueryText = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false),
                    ScopeKind = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: true),
                    FolderId = table.Column<Guid>(type: "TEXT", nullable: true),
                    IncludeSubfolders = table.Column<bool>(type: "INTEGER", nullable: false),
                    IncludeCompleted = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedSearch", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SavedSearch_Name",
                table: "SavedSearch",
                column: "Name",
                unique: true);
        }

        private static void RenameKeywordKeys(MigrationBuilder migrationBuilder)
        {
            foreach (var key in new[] { "has", "no", "is" })
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
            migrationBuilder.DropTable(
                name: "SavedSearch");
        }
    }
}