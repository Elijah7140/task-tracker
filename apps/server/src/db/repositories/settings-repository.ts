import { Effect, Schema } from "effect";
import { SqlSchema, type SqlClient } from "effect/sql";
import { Guid } from "../storage-codecs.js";

const row = Schema.Struct({ Key: Schema.String, Value: Schema.String });
const toMap = (rows: readonly (typeof row.Type)[]) =>
  new Map(rows.map(({ Key, Value }) => [Key, Value]));

/** Reads legacy setting text on the caller's transaction. */
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
  };
}
