import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** The file in the instance profile whose OS lock serialises launches. */
export const LAUNCH_LOCK_FILE = "LaunchLock";

/**
 * How long a launch waits for another launch's lock attempt. A launch that
 * notifies a running instance holds the lock until that instance acknowledges,
 * which Chromium allows up to 20 seconds per step.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Options for {@link withLaunchLock}. */
export interface LaunchLockOptions {
  /** How long to wait for another launch to finish, in milliseconds. */
  readonly timeoutMs?: number;
  /** Reports why the attempt ran without the lock. */
  readonly warn?: (message: string) => void;
}

/**
 * Runs `attempt` while holding an exclusive OS file lock in `profile`, so that
 * launches on one profile take Electron's single-instance lock one at a time (§7.12).
 *
 * On Linux, Chromium checks a lock holder by its executable name, which must be
 * `chrome`. A launch that finds the lock of an instance still creating its socket
 * therefore deletes it as orphaned and takes its own, and both instances run.
 * Under this lock a launch only looks once the other launch's socket is listening.
 *
 * SQLite holds the lock through the OS, so it is released if the process dies.
 * When the lock cannot be taken in time, `attempt` still runs, unserialised.
 */
export function withLaunchLock<Result>(
  profile: string,
  attempt: () => Result,
  options: LaunchLockOptions = {},
): Result {
  const lock = takeLock(profile, options);
  try {
    return attempt();
  } finally {
    lock?.close();
  }
}

/** Opens the lock file and waits for its exclusive lock, or reports why it could not. */
function takeLock(profile: string, options: LaunchLockOptions) {
  let database: DatabaseSync | undefined;
  try {
    mkdirSync(profile, { recursive: true });
    database = new DatabaseSync(join(profile, LAUNCH_LOCK_FILE), {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    database.exec("BEGIN EXCLUSIVE");
    return database;
  } catch (error) {
    database?.close();
    options.warn?.(`Starting without the launch lock: ${String(error)}`);
    return undefined;
  }
}
