import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { RpcConnection } from "@task-tracker/contracts";
import { Effect, Schema } from "effect";

interface ServerExit {
  readonly diagnostic: string;
}

/** A running server child with its readiness, exit and graceful stop. */
export interface ServerProcess {
  readonly ready: Promise<RpcConnection>;
  readonly closed: Promise<ServerExit>;
  readonly stop: () => Promise<void>;
}

const decodeConnection = Schema.decodeUnknownSync(RpcConnection);

/** Starts the built server under Electron's Node runtime and reads its private readiness line. */
export function launchServer(entry: string, rendererOrigin: string): ServerProcess {
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      TASKTRACKER_RENDERER_ORIGIN: rendererOrigin,
      TASKTRACKER_PARENT_PIPE: "1",
    },
    windowsHide: true,
  });
  const closed = observeExit(child);
  return {
    ready: waitForReadiness(child, closed),
    closed,
    stop: () => stopServer(child, closed),
  };
}

function observeExit(child: ChildProcessWithoutNullStreams): Promise<ServerExit> {
  return new Promise((resolve) => {
    let stderr = "";
    let spawnError: Error | undefined;
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, 4000);
    });
    child.on("error", (error) => {
      spawnError = error;
    });
    // The pipe can close before end() on quit if the child has already failed.
    child.stdin.on("error", () => {});
    child.once("close", (code, signal) => {
      resolve({
        diagnostic: spawnError?.message ?? (stderr.trim() || `Server exited (${signal ?? code}).`),
      });
    });
  });
}

async function waitForReadiness(
  child: ChildProcessWithoutNullStreams,
  closed: Promise<ServerExit>,
) {
  const lines = createInterface({ input: child.stdout });
  try {
    const line = await Promise.race([
      new Promise<string>((resolve) => lines.once("line", resolve)),
      closed.then(({ diagnostic }) => Promise.reject(new Error(diagnostic))),
    ]);
    try {
      return decodeConnection(JSON.parse(line));
    } catch {
      // The raw line may contain a credential.
      throw new Error("The server sent an invalid readiness message.");
    }
  } finally {
    lines.close();
    child.stdout.resume();
  }
}

async function stopServer(child: ChildProcessWithoutNullStreams, closed: Promise<ServerExit>) {
  child.stdin.end();
  const graceful = await Effect.runPromise(
    Effect.promise(() => closed).pipe(Effect.timeoutOption("10 seconds")),
  );
  if (graceful._tag === "None") {
    child.kill("SIGKILL");
    await closed;
  }
}
