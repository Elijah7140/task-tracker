import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { RpcConnection } from "@task-tracker/contracts";
import { type Duration, Effect, Option, Schema } from "effect";
import {
  BASH,
  CLOSE_INHERITED_DESCRIPTORS,
  canCloseInheritedDescriptors,
} from "./inherited-descriptors.js";
import {
  decodeServerLine,
  encodeServerCommand,
  type ServerCommand,
  type ServerMessage,
} from "./server-messages.js";

interface ServerExit {
  readonly diagnostic: string;
}

/** A running server child with its readiness, exit and graceful stop. */
export interface ServerProcess {
  readonly ready: Promise<RpcConnection>;
  readonly closed: Promise<ServerExit>;
  readonly stop: () => Promise<void>;
  /**
   * Writes one validated message line to the server's private stdin pipe. False
   * once the server has exited, or for a message the protocol does not allow.
   */
  readonly send: (command: ServerCommand) => boolean;
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

/** Exec preserves the PID and stdio after the inherited descriptors are closed. */
const runAfterClosingDescriptors = `${CLOSE_INHERITED_DESCRIPTORS}exec "$@"\n`;

/**
 * The command that starts the server. On Linux it runs through bash so inherited
 * descriptors are closed first; without bash it starts the server directly.
 */
function serverCommand(entry: string) {
  if (canCloseInheritedDescriptors()) {
    const args = ["-p", "-c", runAfterClosingDescriptors, "task-tracker-server", process.execPath];
    return { executable: BASH, args: [...args, entry] };
  }
  return { executable: process.execPath, args: [entry] };
}

/**
 * Starts the built server under Electron's Node runtime and reads its private
 * readiness line. Each later valid line goes to `onMessage`; others are ignored.
 */
export function launchServer(
  entry: string,
  rendererOrigin: string,
  timeouts: ServerTimeouts = defaultTimeouts,
  onMessage: (message: ServerMessage) => void = () => {},
): ServerProcess {
  const { executable, args } = serverCommand(entry);
  const child = spawn(executable, args, {
    env: serverEnvironment(rendererOrigin),
    windowsHide: true,
  });
  const closed = observeExit(child);
  const lines = readServerLines(child, onMessage);
  return {
    ready: waitForReadiness(child, lines, closed, timeouts.readiness),
    closed,
    stop: () => stopServer(child, closed, timeouts.stop),
    send: (command) => sendCommand(child, command),
  };
}

function sendCommand(child: ChildProcessWithoutNullStreams, command: ServerCommand): boolean {
  if (!child.stdin.writable || child.exitCode !== null) {
    return false;
  }
  const line = encodeServerCommand(command);
  if (Option.isNone(line)) {
    return false;
  }
  child.stdin.write(line.value);
  return true;
}

interface ServerLines {
  readonly first: Promise<string>;
  readonly close: () => void;
}

/**
 * Reads stdout from the start with one listener, so messages that arrive in the
 * same chunk as the readiness line are not lost.
 */
function readServerLines(
  child: ChildProcessWithoutNullStreams,
  onMessage: (message: ServerMessage) => void,
): ServerLines {
  const lines = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  let resolveFirst: ((line: string) => void) | undefined;
  const first = new Promise<string>((resolve) => {
    resolveFirst = resolve;
  });
  lines.on("line", (line) => {
    if (resolveFirst !== undefined) {
      resolveFirst(line);
      resolveFirst = undefined;
      return;
    }
    Option.map(decodeServerLine(line), onMessage);
  });
  return { first, close: () => lines.close() };
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
function firstLine(lines: ServerLines, closed: Promise<ServerExit>) {
  return Promise.race([
    lines.first,
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
  lines: ServerLines,
  closed: Promise<ServerExit>,
  timeout: Duration.Input,
) {
  try {
    const line = await Effect.runPromise(
      Effect.promise(() => firstLine(lines, closed)).pipe(Effect.timeoutOption(timeout)),
    );
    if (Option.isNone(line)) {
      child.kill("SIGKILL");
      throw new Error("Server did not become ready");
    }
    return decodeReadiness(line.value);
  } catch (error) {
    lines.close();
    child.stdout.resume();
    throw error;
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
