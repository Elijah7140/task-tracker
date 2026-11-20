import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { expect, test, vi } from "vitest";
import { LAUNCH_LOCK_FILE, withLaunchLock } from "../src/launch-lock.js";

const launchLockModule = pathToFileURL(
  join(import.meta.dirname, "..", "src", "launch-lock.ts"),
).href;

/**
 * A launch in another process: it says it is waiting, takes the lock, then
 * reports whether the test had already released it by then.
 */
const waitingLaunch = `
const [moduleUrl, profile, released] = process.argv.slice(1);
const { existsSync, writeSync } = await import("node:fs");
const { withLaunchLock } = await import(moduleUrl);
writeSync(1, "waiting\\n");
withLaunchLock(profile, () => {
  writeSync(1, existsSync(released) ? "released\\n" : "early\\n");
});
`;

/** Another process that holds the lock until it is killed. */
const holdingLaunch = `
const [path] = process.argv.slice(1);
const { writeSync } = await import("node:fs");
const { DatabaseSync } = await import("node:sqlite");
new DatabaseSync(path).exec("BEGIN EXCLUSIVE");
writeSync(1, "held\\n");
setInterval(() => {}, 60_000);
`;

const lockTest = test.extend<{ profile: string }>({
  profile: async ({ onTestFinished }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "task-tracker-launch-lock-"));
    onTestFinished(() => rm(directory, { recursive: true, force: true, maxRetries: 5 }));
    await use(join(directory, "profile"));
  },
});

/** A script running in another Node process, with what it has printed so far. */
interface Script {
  readonly child: ChildProcess;
  readonly output: { text: string };
}

function runScript(source: string, args: readonly string[]): Script {
  const child = spawn(process.execPath, ["--input-type=module", "-e", source, ...args], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const output = { text: "" };
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output.text += chunk;
  });
  return { child, output };
}

/** Waits until the script has printed `text`, failing if it exits first. */
async function waitForOutput({ child, output }: Script, text: string) {
  while (!output.text.includes(text)) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The script exited before printing "${text}": ${output.text}`);
    }
    await Promise.race([once(child.stdout ?? child, "data"), once(child, "exit")]);
  }
}

/** Takes the lock the way another launch does, as an open transaction in this process. */
function holdLock(profile: string) {
  mkdirSync(profile, { recursive: true });
  const database = new DatabaseSync(join(profile, LAUNCH_LOCK_FILE));
  database.exec("BEGIN EXCLUSIVE");
  return database;
}

lockTest("A launch takes the lock only after another launch releases it", async ({ profile }) => {
  const held = holdLock(profile);
  const released = join(profile, "..", "released");
  const launch = runScript(waitingLaunch, [launchLockModule, profile, released]);
  await waitForOutput(launch, "waiting");

  await writeFile(released, "");
  held.close();
  await once(launch.child, "exit");

  expect(launch.output.text).toBe("waiting\nreleased\n");
});

lockTest("A launch that dies holding the lock does not block the next", async ({ profile }) => {
  mkdirSync(profile, { recursive: true });
  const holder = runScript(holdingLaunch, [join(profile, LAUNCH_LOCK_FILE)]);
  await waitForOutput(holder, "held");
  const warn = vi.fn();

  const exited = once(holder.child, "exit");
  holder.child.kill("SIGKILL");
  await exited;
  // Windows may release a dead process's file lock a moment after it exits.
  const result = withLaunchLock(profile, () => "started", { timeoutMs: 5_000, warn });

  expect({ result, warnings: warn.mock.calls }).toEqual({ result: "started", warnings: [] });
});

lockTest("A launch that cannot take the lock in time starts anyway and says why", ({ profile }) => {
  const held = holdLock(profile);
  const warn = vi.fn();

  const result = withLaunchLock(profile, () => "started", { timeoutMs: 0, warn });
  held.close();

  expect(result).toBe("started");
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^Starting without the launch lock: /));
});

lockTest("The lock is released when the attempt throws", ({ profile }) => {
  const failure = new Error("Lock attempt failed.");
  const warn = vi.fn();

  expect(() =>
    withLaunchLock(profile, () => {
      throw failure;
    }),
  ).toThrow(failure);
  const result = withLaunchLock(profile, () => "started", { timeoutMs: 0, warn });

  expect({ result, warnings: warn.mock.calls }).toEqual({ result: "started", warnings: [] });
});
