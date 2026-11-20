import { describe, expect, it } from "vitest";
import type { RelaunchCommand } from "../src/relaunch-after-exit.js";
import { type RelaunchMethods, relaunchOnExit } from "../src/relaunch-on-exit.js";

const command: RelaunchCommand = {
  executable: "/home/alex/Apps/TaskTracker.AppImage",
  args: ["--user-data-dir=/home/alex/profile"],
  environment: { HOME: "/home/alex" },
};

/** Fake relaunch methods that record their calls; the helper starts unless `helperStarts` is false. */
function fakeMethods(helperStarts: boolean) {
  const calls: Array<{ readonly method: string; readonly value: unknown }> = [];
  const methods: RelaunchMethods = {
    afterExit: (value) => {
      calls.push({ method: "afterExit", value });
      return helperStarts ? { release: () => {} } : undefined;
    },
    electron: (value) => {
      calls.push({ method: "electron", value });
    },
  };
  return { calls, methods };
}

describe("relaunchOnExit", () => {
  it("Starts the command once this process exits where the OS supports it", () => {
    const { calls, methods } = fakeMethods(true);

    relaunchOnExit(command, methods);

    expect(calls).toEqual([{ method: "afterExit", value: command }]);
  });

  it("Falls back to Electron's relaunch of the same program and arguments", () => {
    const { calls, methods } = fakeMethods(false);

    relaunchOnExit(command, methods);

    expect(calls).toEqual([
      { method: "afterExit", value: command },
      {
        method: "electron",
        value: {
          execPath: "/home/alex/Apps/TaskTracker.AppImage",
          args: ["--user-data-dir=/home/alex/profile"],
        },
      },
    ]);
  });
});
