import { buildTodayTree, currentLocalDay, localDayWindow } from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { todayRepository } from "../db/repositories/today-repository.js";
import { operationTime } from "./operation-time.js";

/** Culture-aware and case-insensitive, like the legacy project and breadcrumb ordering. */
const compareNames = new Intl.Collator(undefined, { sensitivity: "accent" }).compare;

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const today = todayRepository(sql);

  /** Reads today's tree in one transaction, for the local day of the operation's time. */
  const load = sql.withTransaction(
    Effect.gen(function* () {
      const day = currentLocalDay(yield* operationTime, timeZone);
      const items = yield* today.load(localDayWindow(day, timeZone));
      return { day, ...buildTodayTree(items, compareNames) };
    }),
  );

  return { load };
});

/**
 * Loads the Today view (§7.14): items completed during the current local day
 * in the server's zone that are still complete, across all projects, with
 * their ancestors as context. The day comes from Effect Clock.
 */
export class TodayService extends Context.Service<TodayService>()(
  "@task-tracker/server/TodayService",
  { make },
) {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
