import { applyDdl } from "./apply-ddl.js";

/** Partial index for active completed items. */
export const todayCompletionsSchema = [
  `CREATE INDEX "IX_TodoItem_CompletedAtUtc" ON "TodoItem" ("CompletedAtUtc") WHERE CompletedAtUtc IS NOT NULL AND DeletedAtUtc IS NULL`,
];

export default applyDdl(todayCompletionsSchema);
