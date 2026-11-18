import { Effect } from "effect";
import { SqlClient } from "effect/sql";

// DDL emitted by the EF 20261113163313_InitialCreate migration.
const schema = [
  `CREATE TABLE "GlobalSetting" (
    "Key" TEXT NOT NULL CONSTRAINT "PK_GlobalSetting" PRIMARY KEY,
    "Value" TEXT NOT NULL
)`,
  `CREATE TABLE "ItemType" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_ItemType" PRIMARY KEY,
    "IconKey" TEXT NULL,
    "Name" TEXT NOT NULL,
    "ColorKey" TEXT NULL,
    "IsBuiltIn" INTEGER NOT NULL,
    "IsArchived" INTEGER NOT NULL,
    "SortOrder" INTEGER NOT NULL
)`,
  `CREATE TABLE "PriorityLevel" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_PriorityLevel" PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "ColorKey" TEXT NULL,
    "IsBuiltIn" INTEGER NOT NULL,
    "IsArchived" INTEGER NOT NULL,
    "SortOrder" INTEGER NOT NULL
)`,
  `CREATE TABLE "Project" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Project" PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "Description" TEXT NULL,
    "SortOrder" INTEGER NOT NULL,
    "CreatedAtUtc" TEXT NOT NULL,
    "UpdatedAtUtc" TEXT NOT NULL,
    "DeletedAtUtc" TEXT NULL,
    "DeletionBatchId" TEXT NULL
)`,
  `CREATE TABLE "Folder" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_Folder" PRIMARY KEY,
    "ProjectId" TEXT NOT NULL,
    "ParentFolderId" TEXT NULL,
    "Name" TEXT NOT NULL,
    "SortOrder" INTEGER NOT NULL,
    "CreatedAtUtc" TEXT NOT NULL,
    "UpdatedAtUtc" TEXT NOT NULL,
    "DeletedAtUtc" TEXT NULL,
    "DeletionBatchId" TEXT NULL,
    CONSTRAINT "FK_Folder_Folder_ParentFolderId" FOREIGN KEY ("ParentFolderId") REFERENCES "Folder" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Folder_Project_ProjectId" FOREIGN KEY ("ProjectId") REFERENCES "Project" ("Id") ON DELETE RESTRICT
)`,
  `CREATE TABLE "ProjectSetting" (
    "ProjectId" TEXT NOT NULL,
    "Key" TEXT NOT NULL,
    "Value" TEXT NOT NULL,
    CONSTRAINT "PK_ProjectSetting" PRIMARY KEY ("ProjectId", "Key"),
    CONSTRAINT "FK_ProjectSetting_Project_ProjectId" FOREIGN KEY ("ProjectId") REFERENCES "Project" ("Id") ON DELETE RESTRICT
)`,
  `CREATE TABLE "TodoItem" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_TodoItem" PRIMARY KEY,
    "ProjectId" TEXT NOT NULL,
    "FolderId" TEXT NULL,
    "ParentItemId" TEXT NULL,
    "Title" TEXT NOT NULL,
    "Description" TEXT NULL,
    "TicketNumber" TEXT NULL,
    "PriorityLevelId" TEXT NULL,
    "ItemTypeId" TEXT NULL,
    "DueDate" TEXT NULL,
    "DueTime" TEXT NULL,
    "ScheduledStart" TEXT NULL,
    "ScheduledEnd" TEXT NULL,
    "CompletedAtUtc" TEXT NULL,
    "SortOrder" INTEGER NOT NULL,
    "CreatedAtUtc" TEXT NOT NULL,
    "UpdatedAtUtc" TEXT NOT NULL,
    "DeletedAtUtc" TEXT NULL,
    "DeletionBatchId" TEXT NULL,
    CONSTRAINT "CK_TodoItem_DueTime" CHECK (DueTime IS NULL OR DueDate IS NOT NULL),
    CONSTRAINT "CK_TodoItem_ScheduledEnd" CHECK (ScheduledEnd IS NULL OR (ScheduledStart IS NOT NULL AND ScheduledEnd >= ScheduledStart)),
    CONSTRAINT "FK_TodoItem_Folder_FolderId" FOREIGN KEY ("FolderId") REFERENCES "Folder" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TodoItem_ItemType_ItemTypeId" FOREIGN KEY ("ItemTypeId") REFERENCES "ItemType" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TodoItem_PriorityLevel_PriorityLevelId" FOREIGN KEY ("PriorityLevelId") REFERENCES "PriorityLevel" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TodoItem_Project_ProjectId" FOREIGN KEY ("ProjectId") REFERENCES "Project" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TodoItem_TodoItem_ParentItemId" FOREIGN KEY ("ParentItemId") REFERENCES "TodoItem" ("Id") ON DELETE RESTRICT
)`,
  `CREATE INDEX "IX_Folder_ParentFolderId" ON "Folder" ("ParentFolderId")`,
  `CREATE INDEX "IX_Folder_ProjectId_ParentFolderId" ON "Folder" ("ProjectId", "ParentFolderId")`,
  `CREATE UNIQUE INDEX "IX_ItemType_Name" ON "ItemType" ("Name")`,
  `CREATE UNIQUE INDEX "IX_PriorityLevel_Name" ON "PriorityLevel" ("Name")`,
  `CREATE INDEX "IX_TodoItem_DueDate" ON "TodoItem" ("DueDate")`,
  `CREATE INDEX "IX_TodoItem_FolderId" ON "TodoItem" ("FolderId")`,
  `CREATE INDEX "IX_TodoItem_ItemTypeId" ON "TodoItem" ("ItemTypeId")`,
  `CREATE INDEX "IX_TodoItem_ParentItemId" ON "TodoItem" ("ParentItemId")`,
  `CREATE INDEX "IX_TodoItem_PriorityLevelId" ON "TodoItem" ("PriorityLevelId")`,
  `CREATE INDEX "IX_TodoItem_ProjectId_FolderId" ON "TodoItem" ("ProjectId", "FolderId")`,
  `CREATE INDEX "IX_TodoItem_TicketNumber" ON "TodoItem" ("TicketNumber")`,
];

// Snapshot the migration's data so runtime lookup changes cannot change a fresh database.
const itemTypes = [
  { Id: "019A0000-0000-7000-8000-000000000001", Name: "Change", SortOrder: 0 },
  { Id: "019A0000-0000-7000-8000-000000000002", Name: "Error", SortOrder: 1 },
  { Id: "019A0000-0000-7000-8000-000000000003", Name: "Discussion", SortOrder: 2 },
];

const priorities = [
  { Id: "019A0000-0000-7000-8000-000000000101", Name: "Critical", SortOrder: 0 },
  { Id: "019A0000-0000-7000-8000-000000000102", Name: "High", SortOrder: 1 },
  { Id: "019A0000-0000-7000-8000-000000000103", Name: "Medium", SortOrder: 2 },
  { Id: "019A0000-0000-7000-8000-000000000104", Name: "Low", SortOrder: 3 },
];

const lookupDefaults = { ColorKey: null, IsArchived: 0, IsBuiltIn: 1 };

/** Creates and seeds the seven tables in the legacy initial schema. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* Effect.forEach(schema, (statement) => sql.unsafe(statement), { discard: true });
  for (const row of itemTypes) {
    yield* sql`INSERT INTO ItemType ${sql.insert({ ...row, ...lookupDefaults, IconKey: null })}`;
  }
  for (const row of priorities) {
    yield* sql`INSERT INTO PriorityLevel ${sql.insert({ ...row, ...lookupDefaults })}`;
  }
});
