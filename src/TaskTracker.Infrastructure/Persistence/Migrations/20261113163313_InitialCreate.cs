using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace TaskTracker.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GlobalSetting",
                columns: table => new
                {
                    Key = table.Column<string>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GlobalSetting", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "ItemType",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    IconKey = table.Column<string>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    ColorKey = table.Column<string>(type: "TEXT", nullable: true),
                    IsBuiltIn = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ItemType", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PriorityLevel",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    ColorKey = table.Column<string>(type: "TEXT", nullable: true),
                    IsBuiltIn = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriorityLevel", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Project",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletionBatchId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Project", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Folder",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ParentFolderId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletionBatchId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Folder", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Folder_Folder_ParentFolderId",
                        column: x => x.ParentFolderId,
                        principalTable: "Folder",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Folder_Project_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Project",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProjectSetting",
                columns: table => new
                {
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Key = table.Column<string>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectSetting", x => new { x.ProjectId, x.Key });
                    table.ForeignKey(
                        name: "FK_ProjectSetting_Project_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Project",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TodoItem",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FolderId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ParentItemId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    TicketNumber = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    PriorityLevelId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ItemTypeId = table.Column<Guid>(type: "TEXT", nullable: true),
                    DueDate = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    DueTime = table.Column<TimeOnly>(type: "TEXT", nullable: true),
                    ScheduledStart = table.Column<DateTime>(type: "TEXT", nullable: true),
                    ScheduledEnd = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletionBatchId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TodoItem", x => x.Id);
                    table.CheckConstraint("CK_TodoItem_DueTime", "DueTime IS NULL OR DueDate IS NOT NULL");
                    table.CheckConstraint("CK_TodoItem_ScheduledEnd", "ScheduledEnd IS NULL OR (ScheduledStart IS NOT NULL AND ScheduledEnd >= ScheduledStart)");
                    table.ForeignKey(
                        name: "FK_TodoItem_Folder_FolderId",
                        column: x => x.FolderId,
                        principalTable: "Folder",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TodoItem_ItemType_ItemTypeId",
                        column: x => x.ItemTypeId,
                        principalTable: "ItemType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TodoItem_PriorityLevel_PriorityLevelId",
                        column: x => x.PriorityLevelId,
                        principalTable: "PriorityLevel",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TodoItem_Project_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Project",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TodoItem_TodoItem_ParentItemId",
                        column: x => x.ParentItemId,
                        principalTable: "TodoItem",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "ItemType",
                columns: new[] { "Id", "ColorKey", "IconKey", "IsArchived", "IsBuiltIn", "Name", "SortOrder" },
                values: new object[,]
                {
                    { new Guid("019a0000-0000-7000-8000-000000000001"), null, null, false, true, "Change", 0 },
                    { new Guid("019a0000-0000-7000-8000-000000000002"), null, null, false, true, "Error", 1 },
                    { new Guid("019a0000-0000-7000-8000-000000000003"), null, null, false, true, "Discussion", 2 }
                });

            migrationBuilder.InsertData(
                table: "PriorityLevel",
                columns: new[] { "Id", "ColorKey", "IsArchived", "IsBuiltIn", "Name", "SortOrder" },
                values: new object[,]
                {
                    { new Guid("019a0000-0000-7000-8000-000000000101"), null, false, true, "Critical", 0 },
                    { new Guid("019a0000-0000-7000-8000-000000000102"), null, false, true, "High", 1 },
                    { new Guid("019a0000-0000-7000-8000-000000000103"), null, false, true, "Medium", 2 },
                    { new Guid("019a0000-0000-7000-8000-000000000104"), null, false, true, "Low", 3 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Folder_ParentFolderId",
                table: "Folder",
                column: "ParentFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_Folder_ProjectId_ParentFolderId",
                table: "Folder",
                columns: new[] { "ProjectId", "ParentFolderId" });

            migrationBuilder.CreateIndex(
                name: "IX_ItemType_Name",
                table: "ItemType",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PriorityLevel_Name",
                table: "PriorityLevel",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_DueDate",
                table: "TodoItem",
                column: "DueDate");

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_FolderId",
                table: "TodoItem",
                column: "FolderId");

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_ItemTypeId",
                table: "TodoItem",
                column: "ItemTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_ParentItemId",
                table: "TodoItem",
                column: "ParentItemId");

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_PriorityLevelId",
                table: "TodoItem",
                column: "PriorityLevelId");

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_ProjectId_FolderId",
                table: "TodoItem",
                columns: new[] { "ProjectId", "FolderId" });

            migrationBuilder.CreateIndex(
                name: "IX_TodoItem_TicketNumber",
                table: "TodoItem",
                column: "TicketNumber");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GlobalSetting");

            migrationBuilder.DropTable(
                name: "ProjectSetting");

            migrationBuilder.DropTable(
                name: "TodoItem");

            migrationBuilder.DropTable(
                name: "Folder");

            migrationBuilder.DropTable(
                name: "ItemType");

            migrationBuilder.DropTable(
                name: "PriorityLevel");

            migrationBuilder.DropTable(
                name: "Project");
        }
    }
}