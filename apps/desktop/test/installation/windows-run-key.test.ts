import { describe, expect, it } from "vitest";
import { windowsRunKey } from "../../src/installation/windows-run-key.js";

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

/** Records reg.exe calls and answers each with the next exit code. */
function fakeReg(...exitCodes: number[]) {
  const calls: string[][] = [];
  const run = (args: readonly string[]) => {
    calls.push([...args]);
    return Promise.resolve(exitCodes.shift() ?? 0);
  };
  return { calls, run };
}

describe("windowsRunKey", () => {
  it("Queries one value of the per-user Run key", async () => {
    const reg = fakeReg(0);

    const found = await windowsRunKey(reg.run).has("TaskTracker");

    expect(found).toBe(true);
    expect(reg.calls).toEqual([["query", RUN_KEY, "/v", "TaskTracker"]]);
  });

  it("Reports a missing value when reg.exe exits with 1", async () => {
    const reg = fakeReg(1);

    const found = await windowsRunKey(reg.run).has("TaskTracker");

    expect(found).toBe(false);
  });

  it("Treats any other query exit code as a failure", async () => {
    const reg = fakeReg(5);

    const found = windowsRunKey(reg.run).has("TaskTracker");

    await expect(found).rejects.toThrow("reg.exe query exited with code 5.");
  });

  it("Deletes one value without prompting", async () => {
    const reg = fakeReg(0);

    await windowsRunKey(reg.run).remove("TaskTracker");

    expect(reg.calls).toEqual([["delete", RUN_KEY, "/v", "TaskTracker", "/f"]]);
  });

  it("Reports a delete reg.exe refused", async () => {
    const reg = fakeReg(1);

    const removed = windowsRunKey(reg.run).remove("TaskTracker");

    await expect(removed).rejects.toThrow("reg.exe delete exited with code 1.");
  });
});
