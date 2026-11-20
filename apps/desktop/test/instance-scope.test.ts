import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { instanceName, instanceProfile } from "../src/instance-scope.js";

const database = join(tmpdir(), "tasktracker-guard", "Tasks.db");

describe("instanceName", () => {
  it("Depends on the full database path and the user", () => {
    const name = instanceName(database, "alex");

    expect(name).toMatch(/^TaskTracker-[0-9a-f]{32}$/);
    expect(instanceName(join(database, "..", "Tasks.db"), "alex")).toBe(name);
    expect(instanceName(`${database}.other`, "alex")).not.toBe(name);
    expect(instanceName(database, "sam")).not.toBe(name);
  });

  it("Follows the case sensitivity of the platform's paths", () => {
    const lower = database.toLowerCase();

    const windows =
      instanceName(database, "alex", "win32") === instanceName(lower, "alex", "win32");
    const linux = instanceName(database, "alex", "linux") === instanceName(lower, "alex", "linux");

    expect({ windows, linux }).toEqual({ windows: true, linux: false });
  });
});

describe("instanceProfile", () => {
  it("Keeps the profile for the default database", () => {
    const profile = join(tmpdir(), "profile");

    expect(instanceProfile(profile, undefined, "alex")).toBe(profile);
    expect(instanceProfile(profile, "", "alex")).toBe(profile);
  });

  it("Gives each overridden database its own profile beneath the default one", () => {
    const profile = join(tmpdir(), "profile");

    const first = instanceProfile(profile, database, "alex");
    const second = instanceProfile(profile, `${database}.other`, "alex");

    expect(first).toBe(join(profile, "instances", instanceName(database, "alex")));
    expect(second).not.toBe(first);
  });
});
