import { NodeRuntime } from "@effect/platform-node";
import { Cause, Config, Console, Effect, Fiber, Layer, Logger, Runtime } from "effect";
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

/**
 * Electron main kills a server that has not exited 10 seconds after closing
 * stdin, before the database is closed. A stop normally takes milliseconds, so
 * after two seconds the server names the handles that still keep it running.
 * Main includes this output in its warning about the forced stop.
 */
const reportSlowStop = Effect.sleep("2 seconds").pipe(
  Effect.andThen(
    Effect.suspend(() =>
      Effect.logWarning(
        `Still stopping 2 seconds after the parent pipe closed. Open handles: ${process.getActiveResourcesInfo().join(", ")}.`,
      ),
    ),
  ),
  Effect.andThen(Effect.never),
);

/** Runs the server until main closes stdin, then stops it and reports a slow stop. */
const runUntilParentPipeCloses = Effect.gen(function* () {
  const server = yield* Effect.forkChild(runDesktopServer);
  yield* Effect.raceFirst(Fiber.join(server), parentPipeClosed);
  yield* Effect.raceFirst(Fiber.interrupt(server), reportSlowStop);
});

/**
 * Ends the desktop server process as soon as its lifetime ends. The database is
 * closed by then, and main waits for the exit, so a handle that outlives the
 * server's scope must not keep the process running.
 */
const exitWhenDone: Runtime.Teardown = (exit, onExit) =>
  Runtime.defaultTeardown(exit, (code) => {
    onExit(code);
    process.exit(code);
  });

const desktop = process.env.TASKTRACKER_PARENT_PIPE === "1";
const lifetime = desktop ? runUntilParentPipeCloses : runServer(undefined);

NodeRuntime.runMain(
  lifetime.pipe(
    Effect.tapCause((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError(cause),
    ),
    Effect.provideService(Logger.LogToStderr, true),
  ),
  { disableErrorReporting: true, ...(desktop ? { teardown: exitWhenDone } : {}) },
);
