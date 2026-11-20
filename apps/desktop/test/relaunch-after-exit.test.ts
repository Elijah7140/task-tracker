import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { relaunchAfterExit } from "../src/relaunch-after-exit.js";

/**
 * A program that records what it saw at startup: whether the test had already
 * released the relaunch, the kernel's no-new-privileges flag and its arguments.
 */
const recordStart = `
{
  if [ -e "$1/released" ]; then echo released; else echo early; fi
  grep '^NoNewPrivs:' /proc/self/status
  printf '%s\\n' "$@"
} > "$1/started.tmp"
mv "$1/started.tmp" "$1/started"
`;

const relaunchTest = test.extend<{ directory: string }>({
  directory: async ({ onTestFinished }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "task-tracker-relaunch-test-"));
    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    await use(directory);
  },
});

/** Whether the helper for `directory` is still bash, blocked reading its exit pipe. */
function helperWaits(directory: string) {
  return execFileSync("ps", ["-axww", "-o", "wchan:40=,args="], { encoding: "utf8" })
    .split("\n")
    .some(
      (line) =>
        line.includes("task-tracker-relaunch") &&
        line.includes(directory) &&
        line.trimStart().split(/\s+/, 1)[0]?.endsWith("pipe_read") === true,
    );
}

function readStart(directory: string) {
  return readFile(join(directory, "started"), "utf8").catch(() => undefined);
}

relaunchTest.skipIf(process.platform !== "linux")(
  "Starts the program only after release, with its arguments and without no-new-privileges",
  async ({ directory }) => {
    const command = {
      executable: "/bin/sh",
      args: ["-c", recordStart, "relaunched", directory, "two words"],
    };
    const pending = relaunchAfterExit(command);
    expect(pending).toBeDefined();
    await expect.poll(() => helperWaits(directory)).toBe(true);

    await writeFile(join(directory, "released"), "");
    pending?.release();

    await expect
      .poll(() => readStart(directory))
      .toBe(["released", "NoNewPrivs:\t0", directory, "two words", ""].join("\n"));
  },
);
