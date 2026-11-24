import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright";
import { test } from "vitest";
import { unpackedExecutable as executable } from "../../scripts/package-paths.ts";

export { executable };

/** The Phase 3 EF fixture. Tests copy it and never open the original. */
export const phase3Fixture = fileURLToPath(
  new URL("../../../server/test/fixtures/ef/phase-3.db", import.meta.url),
);

/** The newest EF fixture, at the `legacy-final` schema. Tests copy it and never open the original. */
export const legacyFinalFixture = fileURLToPath(
  new URL("../../../server/test/fixtures/ef/legacy-final.db", import.meta.url),
);

/** Temporary paths for one test's database and Electron profile. */
export interface DesktopFixture {
  readonly database: string;
  readonly profile: string;
}

/** A Vitest test with a fresh temporary database and profile, removed afterwards. */
export const desktopTest = test.extend<{ desktop: DesktopFixture }>({
  desktop: async ({ onTestFinished }, use) => {
    const temporary = await mkdtemp(join(tmpdir(), "task-tracker-desktop-"));
    onTestFinished(() => rm(temporary, { recursive: true, force: true, maxRetries: 5 }));
    const data = join(temporary, "data");
    await mkdir(data);
    await use({ database: join(data, "tasktracker.db"), profile: join(temporary, "profile") });
  },
});

/** Replaces the test database with a disposable copy of the Phase 3 EF fixture. */
export function usePhase3Fixture(desktop: DesktopFixture) {
  return copyFile(phase3Fixture, desktop.database);
}

/** Replaces the test database with a disposable copy of the `legacy-final` EF fixture. */
export function useLegacyFinalFixture(desktop: DesktopFixture) {
  return copyFile(legacyFinalFixture, desktop.database);
}

/** The environment that points the packaged app at the test database, plus `extra`. */
export function desktopEnvironment(desktop: DesktopFixture, extra: NodeJS.ProcessEnv = {}) {
  return { ...process.env, ...extra, TASKTRACKER_DB_PATH: desktop.database };
}

/** Starts the packaged app against the test database and profile, with any extra variables. */
export function launch(desktop: DesktopFixture, environment: NodeJS.ProcessEnv = {}) {
  return _electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${desktop.profile}`],
    env: desktopEnvironment(desktop, environment),
    chromiumSandbox: true,
    timeout: 10_000,
  });
}

/**
 * Playwright's wait for one action or locator, well inside the test timeout so failures
 * name the step. Actions that take milliseconds have passed 5 seconds on a busy macOS runner.
 */
const ACTION_TIMEOUT = 10_000;

/** The app window once the renderer has loaded. */
export async function firstWindow(application: ElectronApplication) {
  const page = await application.firstWindow({ timeout: 10_000 });
  page.setDefaultTimeout(ACTION_TIMEOUT);
  return page;
}

/**
 * Launches the app, runs `scenario` in its window and closes the app cleanly
 * afterwards, even when the scenario fails. Call it again to check what
 * persisted across a relaunch.
 */
export async function withDesktop<Result>(
  desktop: DesktopFixture,
  scenario: (page: Page, application: ElectronApplication) => Promise<Result>,
  environment: NodeJS.ProcessEnv = {},
) {
  const application = await launch(desktop, environment);
  try {
    return await scenario(await firstWindow(application), application);
  } finally {
    await application.close();
  }
}
