import { NodeRuntime } from "@effect/platform-node";
import { Cause, Config, Console, Effect, Layer, Logger } from "effect";
import { resolve } from "node:path";
import { databaseLayer } from "./db/database-layer.js";
import { databasePath } from "./db/database-path.js";
import { parentPipeClosed } from "./parent-pipe.js";
import { LoopbackRpc, loopbackRpcLayer } from "./rpc/loopback-rpc.js";
import { transferEnvironmentLayer } from "./services/transfer/transfer-environment.js";

const runServer = Effect.gen(function* () {
  const rendererOrigin = yield* Config.String("TASKTRACKER_RENDERER_ORIGIN");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const path = databasePath();
  // Electron main grants chosen transfer files on the private stdin pipe (§4, §7.9).
  const transfer = transferEnvironmentLayer(
    resolve(path),
    process.env.TASKTRACKER_PARENT_PIPE === "1",
  );
  const server = loopbackRpcLayer({ rendererOrigin, timeZone, transfer }).pipe(
    Layer.provide(databaseLayer(path)),
  );

  yield* Effect.gen(function* () {
    const connection = yield* LoopbackRpc;
    // The launcher reads one readiness line from its private child stdout pipe.
    yield* Console.log(JSON.stringify(connection));
    yield* Effect.never;
  }).pipe(Effect.provide(server));
});

const lifetime =
  process.env.TASKTRACKER_PARENT_PIPE === "1"
    ? Effect.raceFirst(runServer, parentPipeClosed)
    : runServer;

NodeRuntime.runMain(
  lifetime.pipe(
    Effect.tapCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause),
    ),
    Effect.provideService(Logger.LogToStderr, true),
  ),
  { disableErrorReporting: true },
);
