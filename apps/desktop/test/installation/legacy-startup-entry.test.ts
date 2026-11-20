import { describe, expect, it } from "vitest";
import {
  LEGACY_RUN_VALUE,
  replaceLegacyStartupEntry,
  type RunKey,
} from "../../src/installation/legacy-startup-entry.js";
import type { StartupEntry } from "../../src/installation/startup-registration.js";

const APP_VALUE = "app.tasktracker.desktop";
const LEGACY_EXECUTABLE =
  '"C:\\Users\\alex\\AppData\\Local\\TaskTracker\\current\\TaskTracker.exe"';

/** An in-memory per-user Run key shared by the legacy value and the new login item. */
class FakeRunKey implements RunKey {
  readonly values = new Map<string, string>();
  refusesDelete = false;

  has(name: string) {
    return Promise.resolve(this.values.has(name));
  }

  remove(name: string) {
    if (this.refusesDelete) {
      return Promise.reject(new Error("Access is denied."));
    }
    this.values.delete(name);
    return Promise.resolve();
  }
}

/** The new app's login item, writing its own value into the same fake key. */
function loginItemEntry(runKey: FakeRunKey, refuses = false): StartupEntry {
  return {
    write: () => {
      if (refuses) {
        return Promise.reject(new Error("The start-with-system entry was not updated."));
      }
      runKey.values.set(APP_VALUE, '"task-tracker.exe"');
      return Promise.resolve();
    },
    remove: () => {
      runKey.values.delete(APP_VALUE);
      return Promise.resolve();
    },
  };
}

describe("replaceLegacyStartupEntry", () => {
  it("Names the value the legacy app wrote", () => {
    expect(LEGACY_RUN_VALUE).toBe("TaskTracker");
  });

  it("Replaces an enabled legacy entry with the app's login item", async () => {
    const runKey = new FakeRunKey();
    runKey.values.set(LEGACY_RUN_VALUE, LEGACY_EXECUTABLE);
    runKey.values.set("OtherApp", "other.exe");

    const replaced = await replaceLegacyStartupEntry(runKey, loginItemEntry(runKey), () => {});

    expect(replaced).toBe(true);
    expect([...runKey.values.keys()].sort()).toEqual(["OtherApp", APP_VALUE]);
  });

  it("Leaves the login item alone when there is no legacy entry", async () => {
    const runKey = new FakeRunKey();
    runKey.values.set("OtherApp", "other.exe");

    const replaced = await replaceLegacyStartupEntry(runKey, loginItemEntry(runKey), () => {});

    expect(replaced).toBe(false);
    expect([...runKey.values.keys()]).toEqual(["OtherApp"]);
  });

  it("Runs only once, so a later choice to turn it off is kept", async () => {
    const runKey = new FakeRunKey();
    runKey.values.set(LEGACY_RUN_VALUE, LEGACY_EXECUTABLE);
    const entry = loginItemEntry(runKey);
    await replaceLegacyStartupEntry(runKey, entry, () => {});
    await entry.remove();

    const replacedAgain = await replaceLegacyStartupEntry(runKey, entry, () => {});

    expect(replacedAgain).toBe(false);
    expect(runKey.values.size).toBe(0);
  });

  it("Still removes the legacy entry when the login item can't be written, and warns", async () => {
    const runKey = new FakeRunKey();
    runKey.values.set(LEGACY_RUN_VALUE, LEGACY_EXECUTABLE);
    const warnings: string[] = [];

    const replaced = await replaceLegacyStartupEntry(
      runKey,
      loginItemEntry(runKey, true),
      (message) => warnings.push(message),
    );

    expect(replaced).toBe(false);
    expect(runKey.values.size).toBe(0);
    expect(warnings).toEqual([
      "Could not move the legacy start-with-system entry: The start-with-system entry was not updated.",
    ]);
  });

  it("Warns and keeps both entries when the legacy value can't be deleted, to retry next time", async () => {
    const runKey = new FakeRunKey();
    runKey.values.set(LEGACY_RUN_VALUE, LEGACY_EXECUTABLE);
    runKey.refusesDelete = true;
    const warnings: string[] = [];

    const replaced = await replaceLegacyStartupEntry(runKey, loginItemEntry(runKey), (message) =>
      warnings.push(message),
    );

    expect(replaced).toBe(false);
    expect([...runKey.values.keys()].sort()).toEqual([APP_VALUE, LEGACY_RUN_VALUE].sort());
    expect(warnings).toEqual([
      "Could not remove the legacy start-with-system entry: Access is denied.",
    ]);
  });

  it("Warns instead of failing when the Run key can't be read", async () => {
    const runKey: RunKey = {
      has: () => Promise.reject(new Error("reg.exe was not found.")),
      remove: () => Promise.resolve(),
    };
    const warnings: string[] = [];

    const replaced = await replaceLegacyStartupEntry(
      runKey,
      loginItemEntry(new FakeRunKey()),
      (message) => warnings.push(message),
    );

    expect(replaced).toBe(false);
    expect(warnings).toEqual([
      "Could not check for the legacy start-with-system entry: reg.exe was not found.",
    ]);
  });
});
