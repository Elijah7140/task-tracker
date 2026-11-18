import type { SqlClient } from "effect/sql";

/** Filters soft-deleted projects, folders and items, with optional qualification for joins. */
export function activeRow(sql: SqlClient.SqlClient, alias?: string) {
  const column = alias === undefined ? "DeletedAtUtc" : `${alias}.DeletedAtUtc`;
  return sql`${sql(column)} IS NULL`;
}
