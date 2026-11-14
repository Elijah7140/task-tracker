using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FieldDefinition",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Key = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    DataType = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: true),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldDefinition", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FieldDefinition_Project_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Project",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FieldChoice",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FieldChoice", x => x.Id);
                    table.UniqueConstraint("AK_FieldChoice_FieldDefinitionId_Id", x => new { x.FieldDefinitionId, x.Id });
                    table.ForeignKey(
                        name: "FK_FieldChoice_FieldDefinition_FieldDefinitionId",
                        column: x => x.FieldDefinitionId,
                        principalTable: "FieldDefinition",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ItemFieldValue",
                columns: table => new
                {
                    ItemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TextValue = table.Column<string>(type: "TEXT", nullable: true),
                    NumberValue = table.Column<double>(type: "REAL", nullable: true),
                    DateValue = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    BoolValue = table.Column<bool>(type: "INTEGER", nullable: true),
                    ChoiceId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ItemFieldValue", x => new { x.ItemId, x.FieldDefinitionId });
                    table.CheckConstraint("CK_ItemFieldValue_ExactlyOne", "(TextValue IS NOT NULL) + (NumberValue IS NOT NULL) + (DateValue IS NOT NULL) + (BoolValue IS NOT NULL) + (ChoiceId IS NOT NULL) = 1");
                    table.ForeignKey(
                        name: "FK_ItemFieldValue_FieldChoice_FieldDefinitionId_ChoiceId",
                        columns: x => new { x.FieldDefinitionId, x.ChoiceId },
                        principalTable: "FieldChoice",
                        principalColumns: new[] { "FieldDefinitionId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ItemFieldValue_FieldDefinition_FieldDefinitionId",
                        column: x => x.FieldDefinitionId,
                        principalTable: "FieldDefinition",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ItemFieldValue_TodoItem_ItemId",
                        column: x => x.ItemId,
                        principalTable: "TodoItem",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FieldDefinition_Key",
                table: "FieldDefinition",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FieldDefinition_ProjectId",
                table: "FieldDefinition",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ItemFieldValue_FieldDefinitionId_ChoiceId",
                table: "ItemFieldValue",
                columns: new[] { "FieldDefinitionId", "ChoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_ItemFieldValue_FieldDefinitionId_DateValue",
                table: "ItemFieldValue",
                columns: new[] { "FieldDefinitionId", "DateValue" });

            migrationBuilder.CreateIndex(
                name: "IX_ItemFieldValue_FieldDefinitionId_NumberValue",
                table: "ItemFieldValue",
                columns: new[] { "FieldDefinitionId", "NumberValue" });

            migrationBuilder.CreateIndex(
                name: "IX_ItemFieldValue_FieldDefinitionId_TextValue",
                table: "ItemFieldValue",
                columns: new[] { "FieldDefinitionId", "TextValue" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ItemFieldValue");

            migrationBuilder.DropTable(
                name: "FieldChoice");

            migrationBuilder.DropTable(
                name: "FieldDefinition");
        }
    }
}