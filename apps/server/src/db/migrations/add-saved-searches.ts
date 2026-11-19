import { Effect } from "effect";
import { applyDdl } from "./apply-ddl.js";
import { reserveSearchKey } from "./reserve-search-key.js";

/** The table and index added in this legacy schema stage. */
export const savedSearchSchema = [
  `CREATE TABLE "SavedSearch" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_SavedSearch" PRIMARY KEY,
    "Name" TEXT COLLATE NOCASE NOT NULL,
    "QueryText" TEXT NOT NULL,
    "ScopeKind" TEXT NOT NULL,
    "ProjectId" TEXT NULL,
    "FolderId" TEXT NULL,
    "IncludeSubfolders" INTEGER NOT NULL,
    "IncludeCompleted" INTEGER NOT NULL,
    "SortOrder" INTEGER NOT NULL,
    "CreatedAtUtc" TEXT NOT NULL,
    "UpdatedAtUtc" TEXT NOT NULL
)`,
  `CREATE UNIQUE INDEX "IX_SavedSearch_Name" ON "SavedSearch" ("Name")`,
];

/** Reserves new query keys and adds the SavedSearch schema. */
export default Effect.gen(function* () {
  for (const key of ["has", "no", "is"]) {
    yield* reserveSearchKey(key, false);
  }
  yield* applyDdl(savedSearchSchema);
});
