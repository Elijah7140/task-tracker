import { NodeRuntime } from "@effect/platform-node";
import { Cause, Config, Console, Effect, Layer, Logger } from "effect";
import { resolve } from "node:path";
import { databaseLayer } from "./db/database-layer.js";
import { databasePath } from "./db/database-path.js";
import { makeParentChannel, type ParentChannel } from "./desktop/parent-channel.js";
import { parentPipeClosed } from "./parent-pipe.js";
import { LoopbackRpc, loopbackRpcLayer } from "./rpc/loopback-rpc.js";
import { transferEnvironmentLayer } from "./services/transfer/transfer-environment.js";

const runServer = (parent: ParentChannel["Service"] | undefined) =>
  Effect.gen(function* () {
    const rendererOrigin = yield* Config.String("TASKTRACKER_RENDERER_ORIGIN");
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const path = databasePath();
    // Electron main grants chosen transfer files on the private stdin pipe (§4, §7.9).
    const transfer = transferEnvironmentLayer(resolve(path), parent);
    const server = loopbackRpcLayer({
      rendererOrigin,
      timeZone,
      transfer,
      ...(parent === undefined ? {} : { parent }),
    }).pipe(Layer.provide(databaseLayer(path)));

    yield* Effect.gen(function* () {
      const connection = yield* LoopbackRpc;
      // The launcher reads one readiness line from its private child stdout pipe.
      yield* Console.log(JSON.stringify(connection));
      // Later lines follow the readiness line on the same pipe.
      yield* parent?.markReady ?? Effect.void;
      yield* Effect.never;
    }).pipe(Effect.provide(server));
  });

/** Under Electron, main owns the stdio pipes and closing stdin stops the server (§4). */
const runDesktopServer = Effect.scoped(
  Effect.flatMap(makeParentChannel(process.stdin, process.stdout), runServer),
);

const lifetime =
  process.env.TASKTRACKER_PARENT_PIPE === "1"
    ? Effect.raceFirst(runDesktopServer, parentPipeClosed)
    : runServer(undefined);

NodeRuntime.runMain(
  lifetime.pipe(
    Effect.tapCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause),
    ),
    Effect.provideService(Logger.LogToStderr, true),
  ),
  { disableErrorReporting: true },
);
