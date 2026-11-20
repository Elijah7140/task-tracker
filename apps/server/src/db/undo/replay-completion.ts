import { MetadataRuleError, SettingsCatalogue, SettingsResolver } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient, Statement } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";

interface Mismatch {
  readonly ProjectId: string;
}

/**
 * Active parents whose completion disagrees with their active children, the state that
 * automatic completion forbids. Only parents selected by the condition are considered.
 */
const mismatchedParents = (sql: SqlClient.SqlClient, parents: Statement.Fragment) => sql<Mismatch>`
  SELECT parent.ProjectId FROM TodoItem AS parent
    JOIN TodoItem AS child ON child.ParentItemId = parent.Id AND child.DeletedAtUtc IS NULL
   WHERE parent.DeletedAtUtc IS NULL AND ${parents}
   GROUP BY parent.Id
  HAVING (parent.CompletedAtUtc IS NOT NULL) <> (SUM(child.CompletedAtUtc IS NULL) = 0)`;

/** Items whose parent chains the step can change: each item, its old parent and its new parent. */
function chainStarts(rows: readonly ReplayRow[]) {
  const ids = new Set<string>();
  for (const { table, source, target } of rows) {
    if (table !== "TodoItem") {
      continue;
    }
    for (const id of [target?.Id, source?.ParentItemId, target?.ParentItemId]) {
      if (id != null) {
        ids.add(String(id));
      }
    }
  }
  return [...ids];
}

const ancestorsOf = (sql: SqlClient.SqlClient, starts: readonly string[]) => sql`parent.Id IN (
  WITH RECURSIVE chain(Id) AS (
    SELECT Id FROM TodoItem WHERE ${sql.in("Id", starts)}
    UNION SELECT item.ParentItemId FROM TodoItem AS item JOIN chain ON item.Id = chain.Id
     WHERE item.ParentItemId IS NOT NULL)
  SELECT Id FROM chain)`;

const readAutoCompletion = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  projectId: string,
) {
  const read = (rows: readonly { Key: string; Value: string }[]) =>
    new Map(rows.map(({ Key, Value }) => [Key, Value]));
  const global = read(
    yield* sql<{ Key: string; Value: string }>`
    SELECT Key, Value FROM GlobalSetting`,
  );
  const overrides = read(
    yield* sql<{ Key: string; Value: string }>`
    SELECT Key, Value FROM ProjectSetting WHERE ProjectId = ${projectId}`,
  );
  return yield* Effect.try({
    try: () =>
      SettingsResolver.resolveValue(SettingsCatalogue.autoCompleteParents, global, overrides).value,
    catch: () => completionRefusal,
  });
});

const completionRefusal = new MetadataRuleError(
  "Items changed since. Applying this step would leave parent completion out of date.",
);

/**
 * Checks completion after the replayed writes against the effective settings they leave.
 * Projects whose automatic completion the step turns on are checked entirely. Elsewhere, the
 * parent chains of replayed items must agree with their children where the setting is on.
 */
export const verifyReplayCompletion = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
  turnedOn: ReadonlySet<string>,
) {
  const starts = chainStarts(rows);
  const candidates = [
    ...(turnedOn.size > 0
      ? yield* mismatchedParents(sql, sql.in("parent.ProjectId", [...turnedOn]))
      : []),
    ...(starts.length > 0 ? yield* mismatchedParents(sql, ancestorsOf(sql, starts)) : []),
  ];
  for (const projectId of new Set(candidates.map((row) => row.ProjectId))) {
    if (turnedOn.has(projectId) || (yield* readAutoCompletion(sql, projectId))) {
      return yield* Effect.fail(completionRefusal);
    }
  }
});
