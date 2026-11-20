import { execFileSync, spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASH,
  CLOSE_INHERITED_DESCRIPTORS,
  canCloseInheritedDescriptors,
} from "./inherited-descriptors.js";

/** A program to start once this process has exited. */
export interface RelaunchCommand {
  readonly executable: string;
  readonly args: readonly string[];
  /** The program's environment. This process's environment when left out. */
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

/** A started relaunch waiting for this process to exit. */
export interface PendingRelaunch {
  /** Lets the program start now instead of at exit. Only tests call this. */
  readonly release: () => void;
}

/** Waits for end-of-file on stdin, which arrives once no process holds the write end. */
const runAfterExit = `${CLOSE_INHERITED_DESCRIPTORS}read -r _\nexec "$@" </dev/null\n`;

interface ExitPipe {
  readonly writer: number;
  readonly reader: number;
}

/**
 * Opens a private FIFO for reading and writing. Node does not track raw file
 * descriptors, so the writer stays open through Electron's shutdown until the
 * kernel closes it when the process exits.
 */
function openExitPipe(): ExitPipe {
  const directory = mkdtempSync(join(tmpdir(), "task-tracker-relaunch-"));
  try {
    const path = join(directory, "exit");
    execFileSync("mkfifo", ["-m", "600", "--", path]);
    // Read-write does not wait for a reader, and the reader then opens at once.
    const writer = openSync(path, "r+");
    try {
      return { writer, reader: openSync(path, "r") };
    } catch (error) {
      closeSync(writer);
      throw error;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Starts bash in its own session to wait on `reader`, then exec `command` in its place. */
function startWaitingHelper({ executable, args, environment }: RelaunchCommand, reader: number) {
  const helper = spawn(
    BASH,
    ["-p", "-c", runAfterExit, "task-tracker-relaunch", executable, ...args],
    {
      detached: true,
      stdio: [reader, "ignore", "ignore"],
      env: environment ?? process.env,
    },
  );
  helper.on("error", () => {});
  helper.unref();
}

/**
 * Starts `command` once this process has exited and released the single-instance
 * lock. Returns nothing where this OS cannot, so the caller falls back to
 * `app.relaunch()`.
 *
 * Electron's `app.relaunch()` on Linux starts the new instance with the kernel's
 * no-new-privileges flag set. The setuid `chrome-sandbox` helper then cannot gain
 * root, so the new instance dies at startup wherever Chromium needs that helper
 * because user namespaces are restricted, as on Ubuntu 24.04. A detached helper
 * spawned from Node never sets the flag.
 */
export function relaunchAfterExit(command: RelaunchCommand): PendingRelaunch | undefined {
  if (!canCloseInheritedDescriptors()) {
    return undefined;
  }
  let pipe: ExitPipe;
  try {
    pipe = openExitPipe();
  } catch {
    return undefined;
  }
  try {
    startWaitingHelper(command, pipe.reader);
  } catch {
    closeSync(pipe.writer);
    return undefined;
  } finally {
    closeSync(pipe.reader);
  }
  return { release: () => closeSync(pipe.writer) };
}
