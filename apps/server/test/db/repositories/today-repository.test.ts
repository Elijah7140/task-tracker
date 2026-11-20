import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { DayBounds, todayQuery } from "../../../src/db/repositories/today-repository.js";
import { withSchema } from "../store.js";

it.effect("Today's completions are found through the partial completion index", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const bounds = { startUtc: "2026-11-13 00:00:00", endUtc: "2026-11-14 00:00:00" };
    const [text, parameters] = todayQuery(sql, bounds satisfies typeof DayBounds.Encoded).compile();

    const plan = yield* sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${text}`, parameters);

    const details = plan.map((step) => step.detail);
    expect(details).toContainEqual(expect.stringContaining("IX_TodoItem_CompletedAtUtc"));
  }).pipe(withSchema),
);
