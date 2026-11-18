import { Effect } from "effect";
import { SqlClient } from "effect/sql";

// DDL emitted by the EF 20261114032356_AddCustomFields migration.
const schema = [
  `CREATE TABLE "FieldDefinition" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldDefinition" PRIMARY KEY,
    "Key" TEXT NOT NULL,
    "DisplayName" TEXT NOT NULL,
    "DataType" TEXT NOT NULL,
    "ProjectId" TEXT NULL,
    "IsArchived" INTEGER NOT NULL,
    "SortOrder" INTEGER NOT NULL,
    CONSTRAINT "FK_FieldDefinition_Project_ProjectId" FOREIGN KEY ("ProjectId") REFERENCES "Project" ("Id") ON DELETE RESTRICT
)`,
  `CREATE TABLE "FieldChoice" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_FieldChoice" PRIMARY KEY,
    "FieldDefinitionId" TEXT NOT NULL,
    "Label" TEXT NOT NULL,
    "SortOrder" INTEGER NOT NULL,
    "IsArchived" INTEGER NOT NULL,
    CONSTRAINT "AK_FieldChoice_FieldDefinitionId_Id" UNIQUE ("FieldDefinitionId", "Id"),
    CONSTRAINT "FK_FieldChoice_FieldDefinition_FieldDefinitionId" FOREIGN KEY ("FieldDefinitionId") REFERENCES "FieldDefinition" ("Id") ON DELETE RESTRICT
)`,
  `CREATE TABLE "ItemFieldValue" (
    "ItemId" TEXT NOT NULL,
    "FieldDefinitionId" TEXT NOT NULL,
    "TextValue" TEXT NULL,
    "NumberValue" REAL NULL,
    "DateValue" TEXT NULL,
    "BoolValue" INTEGER NULL,
    "ChoiceId" TEXT NULL,
    CONSTRAINT "PK_ItemFieldValue" PRIMARY KEY ("ItemId", "FieldDefinitionId"),
    CONSTRAINT "CK_ItemFieldValue_ExactlyOne" CHECK ((TextValue IS NOT NULL) + (NumberValue IS NOT NULL) + (DateValue IS NOT NULL) + (BoolValue IS NOT NULL) + (ChoiceId IS NOT NULL) = 1),
    CONSTRAINT "FK_ItemFieldValue_FieldChoice_FieldDefinitionId_ChoiceId" FOREIGN KEY ("FieldDefinitionId", "ChoiceId") REFERENCES "FieldChoice" ("FieldDefinitionId", "Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_ItemFieldValue_FieldDefinition_FieldDefinitionId" FOREIGN KEY ("FieldDefinitionId") REFERENCES "FieldDefinition" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_ItemFieldValue_TodoItem_ItemId" FOREIGN KEY ("ItemId") REFERENCES "TodoItem" ("Id") ON DELETE CASCADE
)`,
  `CREATE UNIQUE INDEX "IX_FieldDefinition_Key" ON "FieldDefinition" ("Key")`,
  `CREATE INDEX "IX_FieldDefinition_ProjectId" ON "FieldDefinition" ("ProjectId")`,
  `CREATE INDEX "IX_ItemFieldValue_FieldDefinitionId_ChoiceId" ON "ItemFieldValue" ("FieldDefinitionId", "ChoiceId")`,
  `CREATE INDEX "IX_ItemFieldValue_FieldDefinitionId_DateValue" ON "ItemFieldValue" ("FieldDefinitionId", "DateValue")`,
  `CREATE INDEX "IX_ItemFieldValue_FieldDefinitionId_NumberValue" ON "ItemFieldValue" ("FieldDefinitionId", "NumberValue")`,
  `CREATE INDEX "IX_ItemFieldValue_FieldDefinitionId_TextValue" ON "ItemFieldValue" ("FieldDefinitionId", "TextValue")`,
];

/** Adds the three custom-field tables without changing the initial schema. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* Effect.forEach(schema, (statement) => sql.unsafe(statement), { discard: true });
});
