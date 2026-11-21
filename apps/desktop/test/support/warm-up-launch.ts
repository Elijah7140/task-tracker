import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { unpackedExecutable } from "../../scripts/package-paths.ts";

/** Generous, because a fresh CI runner reads the whole packaged app from a cold disk. */
const WARM_UP_TIMEOUT = 60_000;

/**
 * Vitest global setup for the packaged smoke. The first launch on a fresh machine
 * is several seconds slower than later ones, and until it settles the menu bar is
 * not stable enough to click within a test's 5-second action timeout. Launching
 * the app once here, against a throwaway database and profile, means no test
 * depends on which file happens to run first in its shard.
 */
export async function setup() {
  const temporary = await mkdtemp(join(tmpdir(), "task-tracker-warm-up-"));
  try {
    await launchUntilSettled(temporary);
  } catch (error) {
    // The tests launch the app themselves and report a real failure more precisely.
    console.warn("Packaged app warm-up launch failed:", error);
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
  }
}

/** Launches the packaged app, waits until its menu bar is clickable and closes it. */
async function launchUntilSettled(temporary: string) {
  const data = join(temporary, "data");
  await mkdir(data);
  const application = await _electron.launch({
    executablePath: unpackedExecutable,
    args: [`--user-data-dir=${join(temporary, "profile")}`],
    env: { ...process.env, TASKTRACKER_DB_PATH: join(data, "tasktracker.db") },
    chromiumSandbox: true,
    timeout: WARM_UP_TIMEOUT,
  });
  try {
    const page = await application.firstWindow({ timeout: WARM_UP_TIMEOUT });
    // A trial click waits until the button is visible, enabled and stable, without clicking.
    await page.getByTestId("menu-file").click({ trial: true, timeout: WARM_UP_TIMEOUT });
  } finally {
    await application.close();
  }
}
