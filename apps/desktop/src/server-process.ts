import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { RpcConnection } from "@task-tracker/contracts";
import { type Duration, Effect, Option, Schema } from "effect";

interface ServerExit {
  readonly diagnostic: string;
}

/** A running server child with its readiness, exit and graceful stop. */
export interface ServerProcess {
  readonly ready: Promise<RpcConnection>;
  readonly closed: Promise<ServerExit>;
  readonly stop: () => Promise<void>;
}

/** How long the launcher waits for readiness and for a graceful stop before killing the child. */
export interface ServerTimeouts {
  readonly readiness: Duration.Input;
  readonly stop: Duration.Input;
}

const defaultTimeouts: ServerTimeouts = { readiness: "30 seconds", stop: "10 seconds" };

/** The crash dialog keeps the newest server output, where the fatal error appears. */
const diagnosticLength = 4000;

const decodeConnection = Schema.decodeUnknownSync(RpcConnection);

// Chromium can have both ends of a new renderer IPC socket open during spawn.
// Close inherited descriptors in the child before exec so the server cannot keep
// that socket alive after the renderer exits. Exec preserves the PID and stdio.
const closeInheritedDescriptors = `
for path in /proc/self/fd/*; do
  descriptor=\${path##*/}
  if (( descriptor > 2 )); then
    exec {descriptor}>&-
  fi
done
exec "$@"
`;

/** Starts the built server under Electron's Node runtime and reads its private readiness line. */
export function launchServer(
  entry: string,
  rendererOrigin: string,
  timeouts: ServerTimeouts = defaultTimeouts,
): ServerProcess {
  const linux = process.platform === "linux";
  const executable = linux ? "/bin/bash" : process.execPath;
  const args = linux
    ? ["-p", "-c", closeInheritedDescriptors, "task-tracker-server", process.execPath, entry]
    : [entry];
  const child = spawn(executable, args, {
    env: serverEnvironment(rendererOrigin),
    windowsHide: true,
  });
  const closed = observeExit(child);
  return {
    ready: waitForReadiness(child, closed, timeouts.readiness),
    closed,
    stop: () => stopServer(child, closed, timeouts.stop),
  };
}

/** Node reads these at startup to load code or open an inspector, so the server never inherits them. */
function isNodeDebuggingVariable(name: string) {
  const upper = name.toUpperCase();
  return (
    upper === "NODE_OPTIONS" ||
    upper === "NODE_DEBUG" ||
    upper === "NODE_DEBUG_NATIVE" ||
    upper.startsWith("NODE_INSPECT")
  );
}

function serverEnvironment(rendererOrigin: string): NodeJS.ProcessEnv {
  const inherited = Object.entries(process.env).filter(([name]) => !isNodeDebuggingVariable(name));
  return {
    ...Object.fromEntries(inherited),
    ELECTRON_RUN_AS_NODE: "1",
    TASKTRACKER_RENDERER_ORIGIN: rendererOrigin,
    TASKTRACKER_PARENT_PIPE: "1",
  };
}

function observeExit(child: ChildProcessWithoutNullStreams): Promise<ServerExit> {
  return new Promise((resolve) => {
    let stderr = "";
    let spawnError: Error | undefined;
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-diagnosticLength);
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

/** Resolves the first stdout line, or rejects with the diagnostic if the child exits first. */
function firstLine(lines: Interface, closed: Promise<ServerExit>) {
  return Promise.race([
    new Promise<string>((resolve) => lines.once("line", resolve)),
    closed.then(({ diagnostic }) => Promise.reject(new Error(diagnostic))),
  ]);
}

function decodeReadiness(line: string) {
  try {
    return decodeConnection(JSON.parse(line));
  } catch {
    // The raw line may contain a credential.
    throw new Error("The server sent an invalid readiness message.");
  }
}

async function waitForReadiness(
  child: ChildProcessWithoutNullStreams,
  closed: Promise<ServerExit>,
  timeout: Duration.Input,
) {
  const lines = createInterface({ input: child.stdout });
  try {
    const line = await Effect.runPromise(
      Effect.promise(() => firstLine(lines, closed)).pipe(Effect.timeoutOption(timeout)),
    );
    if (Option.isNone(line)) {
      child.kill("SIGKILL");
      throw new Error("Server did not become ready");
    }
    return decodeReadiness(line.value);
  } finally {
    lines.close();
    child.stdout.resume();
  }
}

async function stopServer(
  child: ChildProcessWithoutNullStreams,
  closed: Promise<ServerExit>,
  timeout: Duration.Input,
) {
  child.stdin.end();
  const graceful = await Effect.runPromise(
    Effect.promise(() => closed).pipe(Effect.timeoutOption(timeout)),
  );
  if (Option.isNone(graceful)) {
    child.kill("SIGKILL");
    await closed;
  }
}
