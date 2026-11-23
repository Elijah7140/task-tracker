import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { timestamp } from "../store.js";

/** Fixtures for item and settings mutations, whose application services land in WP8 and WP9. */
export function seedItem(
  projectId: string,
  fields: {
    Id: string;
    FolderId?: string;
    ParentItemId?: string;
    DueDate?: string;
    DueTime?: string;
    CompletedAtUtc?: string;
    ItemTypeId?: string;
    PriorityLevelId?: string;
  },
) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      sql`INSERT INTO TodoItem ${sql.insert({
        ProjectId: projectId,
        Title: "Task",
        SortOrder: 0,
        CreatedAtUtc: timestamp,
        UpdatedAtUtc: timestamp,
        StatusId: fields.CompletedAtUtc ? "019A0000-0000-7000-8000-000000000204" : null,
        ...fields,
      })}`,
    );
  });
}

export function setAutoComplete(value: boolean) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      sql`INSERT OR REPLACE INTO GlobalSetting (Key, Value)
          VALUES ('autoCompleteParents', ${String(value)})`,
    );
  });
}

/** Inspect persisted rows in a separate transaction, including soft-deleted rows. */
export function readItems() {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(sql`SELECT * FROM TodoItem ORDER BY Id`);
  });
}

export { withSchema, timestamp, itemId } from "../store.js";
export const childItemId = "019A0000-0000-7000-8000-000000000CCD";
