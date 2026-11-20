import type { StartupEntry } from "./startup-registration.js";

/**
 * The value the legacy app wrote under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
 * when Start with system was on. This app's login item uses its AppUserModelID instead.
 */
export const LEGACY_RUN_VALUE = "TaskTracker";

/** The per-user Run key operations the upgrade needs. */
export interface RunKey {
  /** True when the key holds a value with this name. */
  readonly has: (name: string) => Promise<boolean>;
  /** Deletes the named value. */
  readonly remove: (name: string) => Promise<void>;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs one step, turning a failure into a warning. True when it succeeded. */
async function attempt(
  step: () => Promise<unknown>,
  failure: string,
  warn: (message: string) => void,
) {
  try {
    await step();
    return true;
  } catch (error) {
    warn(`${failure}: ${describeError(error)}`);
    return false;
  }
}

/**
 * Moves Start with system from the legacy app to this one on the first launch of an
 * installed Windows build after upgrading (§7.13). A leftover legacy value would keep
 * starting the old app, so it is always deleted. Its presence means the user had the
 * option on, so the app's own entry is written first. Once the value is gone this does
 * nothing, so a later choice in App Settings stands. A value that could not be deleted
 * is retried at the next launch. Failures are warnings and never stop startup.
 *
 * @returns True when the legacy entry was found and fully replaced.
 */
export async function replaceLegacyStartupEntry(
  runKey: RunKey,
  entry: StartupEntry,
  warn: (message: string) => void,
): Promise<boolean> {
  let found = false;
  const checked = await attempt(
    async () => {
      found = await runKey.has(LEGACY_RUN_VALUE);
    },
    "Could not check for the legacy start-with-system entry",
    warn,
  );
  if (!checked || !found) {
    return false;
  }
  const written = await attempt(
    () => entry.write(),
    "Could not move the legacy start-with-system entry",
    warn,
  );
  const removed = await attempt(
    () => runKey.remove(LEGACY_RUN_VALUE),
    "Could not remove the legacy start-with-system entry",
    warn,
  );
  return written && removed;
}
