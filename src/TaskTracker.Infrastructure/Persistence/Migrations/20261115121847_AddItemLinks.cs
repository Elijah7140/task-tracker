using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddItemLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            RenameLinkKey(migrationBuilder);

            migrationBuilder.CreateTable(
                name: "ItemLink",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ItemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Url = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 300, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ItemLink", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ItemLink_TodoItem_ItemId",
                        column: x => x.ItemId,
                        principalTable: "TodoItem",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ItemLink_ItemId_SortOrder",
                table: "ItemLink",
                columns: new[] { "ItemId", "SortOrder" });
        }

        /// <summary>"link" is now a built-in search key; an existing custom field with that key gets the first free numeric suffix.</summary>
        private static void RenameLinkKey(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                WITH RECURSIVE candidates(suffix, candidate) AS (
                    SELECT 2, 'link-2'
                    UNION ALL
                    SELECT suffix + 1, 'link-' || (suffix + 1)
                    FROM candidates
                    WHERE EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidates.candidate)
                )
                UPDATE FieldDefinition
                SET Key = (SELECT candidate FROM candidates
                    WHERE NOT EXISTS (SELECT 1 FROM FieldDefinition WHERE Key = candidates.candidate)
                    LIMIT 1)
                WHERE Key = 'link'
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ItemLink");
        }
    }
}