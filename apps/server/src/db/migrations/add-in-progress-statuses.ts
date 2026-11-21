import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { addColumns } from "./apply-ddl.js";

/** The seeded "In progress" status, which starts out marked (§7.18). */
const seededInProgressId = "019A0000-0000-7000-8000-000000000202";

/** Whether open items with the status are listed on the tray card; only Open statuses may be. */
export const inProgressStatusColumns = [
  `IsInProgress INTEGER NOT NULL DEFAULT 0
    CONSTRAINT CK_StatusLevel_IsInProgress CHECK (IsInProgress IN (0, 1) AND (IsInProgress = 0 OR Kind = 0))`,
];

/** Adds the In progress mark and sets it on the seeded status when it is still Open. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* addColumns("StatusLevel", inProgressStatusColumns);
  yield* sql`UPDATE StatusLevel SET IsInProgress = 1 WHERE Id = ${seededInProgressId} AND Kind = 0`;
});
