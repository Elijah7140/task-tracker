import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import {
  type DesktopFixture,
  desktopEnvironment,
  desktopTest,
  executable,
  firstWindow,
  launch,
} from "./support/desktop-app.js";
import { serverChildren, serverPid } from "./support/desktop-processes.js";

/** A packaged app started outside Playwright, with everything it printed. */
interface RawLaunch {
  readonly child: ChildProcess;
  readonly output: string[];
}

/** Starts the packaged app with Chromium logging on, collecting its output for failure reports. */
function start(desktop: DesktopFixture): RawLaunch {
  const child = spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: desktopEnvironment(desktop, { ELECTRON_ENABLE_LOGGING: "1" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  return { child, output };
}

function hasExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function stop({ child }: RawLaunch) {
  if (!hasExited(child)) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
}

/** What one launch is doing now: its exit status, or how many servers it runs. */
function describeLaunch({ child }: RawLaunch) {
  if (hasExited(child)) {
    return `exited ${child.exitCode ?? child.signalCode}`;
  }
  const servers = child.pid === undefined ? 0 : serverChildren(child.pid).length;
  return `running with ${servers} server${servers === 1 ? "" : "s"}`;
}

/** Each launch's state, in a fixed order so the outcome does not depend on which won. */
function describeLaunches(launches: readonly RawLaunch[]) {
  return launches.map(describeLaunch).sort();
}

/** Where each Chromium single-instance lock in the profile points, such as `host-1234`. */
function singletonLocks(profile: string) {
  return readdirSync(profile, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith("SingletonLock"))
    .map((path) => `${path} -> ${readlinkSync(join(profile, path))}`);
}

/** The PIDs, states, locks and output of every launch, for a failed race. */
function raceReport(desktop: DesktopFixture, launches: readonly RawLaunch[]) {
  const states = launches.map(
    (launch) => `PID ${launch.child.pid}: ${describeLaunch(launch)}\n${launch.output.join("")}`,
  );
  return [`Locks: ${singletonLocks(desktop.profile).join(", ")}`, ...states].join("\n\n");
}

desktopTest(
  "Two launches racing on the same database leave one running instance",
  async ({ desktop }) => {
    const launches = [start(desktop), start(desktop)];
    try {
      await expect
        .poll(() => describeLaunches(launches), { timeout: 20_000, interval: 200 })
        .toEqual(["exited 0", "running with 1 server"]);
    } catch (error) {
      // Report before cleanup stops the launches that are still running.
      console.error(raceReport(desktop, launches));
      throw error;
    } finally {
      await Promise.all(launches.map(stop));
    }
  },
);

desktopTest("Different databases run side by side on one profile", async ({ desktop }) => {
  const other = { ...desktop, database: join(desktop.database, "..", "other.db") };
  const first = await launch(desktop);
  try {
    const second = await launch(other);
    try {
      const pages = await Promise.all([firstWindow(first), firstWindow(second)]);
      await Promise.all(pages.map((page) => page.getByTestId("empty-home-create").waitFor()));

      expect(await serverPid(second)).not.toBe(await serverPid(first));
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
});
