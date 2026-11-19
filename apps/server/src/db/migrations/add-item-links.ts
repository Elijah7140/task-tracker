import { Effect } from "effect";
import { applyDdl } from "./apply-ddl.js";
import { reserveSearchKey } from "./reserve-search-key.js";

/** The table and index added in this legacy schema stage. */
export const itemLinkSchema = [
  `CREATE TABLE "ItemLink" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_ItemLink" PRIMARY KEY,
    "ItemId" TEXT NOT NULL,
    "Url" TEXT NOT NULL,
    "Title" TEXT NULL,
    "SortOrder" INTEGER NOT NULL,
    "CreatedAtUtc" TEXT NOT NULL,
    CONSTRAINT "FK_ItemLink_TodoItem_ItemId" FOREIGN KEY ("ItemId") REFERENCES "TodoItem" ("Id") ON DELETE CASCADE
)`,
  `CREATE INDEX "IX_ItemLink_ItemId_SortOrder" ON "ItemLink" ("ItemId", "SortOrder")`,
];

/** Reserves new query keys and adds the ItemLink schema. */
export default Effect.gen(function* () {
  yield* reserveSearchKey("link", true);
  yield* applyDdl(itemLinkSchema);
});
