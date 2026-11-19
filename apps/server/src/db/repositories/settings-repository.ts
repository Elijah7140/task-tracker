import { Effect, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Guid } from "../storage-codecs.js";

const row = Schema.Struct({ Key: Schema.String, Value: Schema.String });
const toMap = (rows: readonly (typeof row.Type)[]) =>
  new Map(rows.map(({ Key, Value }) => [Key, Value]));

/** Reads and writes legacy setting text on the caller's transaction. */
export function settingsRepository(sql: SqlClient.SqlClient) {
  const global = SqlSchema.findAll({
    Request: Schema.Void,
    Result: row,
    execute: () => sql`SELECT Key, Value FROM GlobalSetting`,
  });
  const project = SqlSchema.findAll({
    Request: Guid,
    Result: row,
    execute: (id) => sql`SELECT Key, Value FROM ProjectSetting WHERE ProjectId = ${id}`,
  });
  return {
    global: () => global(undefined).pipe(Effect.map(toMap)),
    project: (projectId: string) => project(projectId).pipe(Effect.map(toMap)),
    setGlobal: SqlSchema.void({
      Request: row,
      execute: ({ Key, Value }) => sql`INSERT INTO GlobalSetting (Key, Value)
        VALUES (${Key}, ${Value}) ON CONFLICT (Key) DO UPDATE SET Value = excluded.Value`,
    }),
    setProject: SqlSchema.void({
      Request: Schema.Struct({
        ProjectId: Guid,
        Key: Schema.String,
        Value: Schema.NullOr(Schema.String),
      }),
      execute: ({ ProjectId, Key, Value }) =>
        Value === null
          ? sql`DELETE FROM ProjectSetting WHERE ProjectId = ${ProjectId} AND Key = ${Key}`
          : sql`INSERT INTO ProjectSetting (ProjectId, Key, Value) VALUES (${ProjectId}, ${Key}, ${Value})
            ON CONFLICT (ProjectId, Key) DO UPDATE SET Value = excluded.Value`,
    }),
  };
}
