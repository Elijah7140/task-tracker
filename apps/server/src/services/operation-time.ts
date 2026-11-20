import { Clock, Effect } from "effect";

/** Read one UTC timestamp for all changes in an operation. */
export const operationTime = Clock.currentTimeMillis.pipe(
  Effect.map((milliseconds) => Temporal.Instant.fromEpochMilliseconds(milliseconds)),
);
