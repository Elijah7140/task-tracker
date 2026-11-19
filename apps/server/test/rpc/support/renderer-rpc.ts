import { Effect, type Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { makeRpcClient } from "../../../../web/src/rpc-client.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../../src/rpc/loopback-rpc.js";
import { withSchema } from "../../db/store.js";

const rendererOrigin = "http://127.0.0.1:5173";

/** The fixed instant at which renderer RPC tests start. */
export const startedAtUtc = "2026-11-13T12:00:00Z";

const rendererFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", rendererOrigin);
  return fetch(input, { ...init, headers });
};

const pinStartTime = TestClock.setTime(Temporal.Instant.from(startedAtUtc).epochMilliseconds);

/**
 * Run a test against the loopback server on a fresh, migrated in-memory database.
 * The clock is pinned before the server starts, so moving it later never replays
 * the reminder scheduler's periodic checks across decades.
 */
export const withRendererRpc = <Value, Error>(
  test: Effect.Effect<Value, Error, SqlClient.SqlClient | Scope.Scope | LoopbackRpc>,
) =>
  withSchema(
    Effect.andThen(
      pinStartTime,
      Effect.scoped(
        test.pipe(
          Effect.provide(loopbackRpcLayer({ rendererOrigin, timeZone: "America/New_York" })),
          Effect.provideService(FetchHttpClient.Fetch, rendererFetch),
        ),
      ),
    ),
  );

/** Connect the renderer client after pinning the test clock to the start instant. */
export const connectRenderer = Effect.gen(function* () {
  yield* pinStartTime;
  const connection = yield* LoopbackRpc;
  return yield* makeRpcClient(connection);
});
