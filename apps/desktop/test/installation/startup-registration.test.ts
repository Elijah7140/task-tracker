import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startupEntryFor } from "../../src/installation/startup-entries.js";
import {
  createStartupRegistration,
  type StartupEntry,
} from "../../src/installation/startup-registration.js";

/** Records what was applied to the entry. */
class RecordingEntry implements StartupEntry {
  readonly applied: string[] = [];

  write() {
    this.applied.push("write");
    return Promise.resolve();
  }

  remove() {
    this.applied.push("remove");
    return Promise.resolve();
  }
}

const refusingEntry: StartupEntry = {
  write: () => Promise.reject(new Error("Access denied.")),
  remove: () => Promise.reject(new Error("Access denied.")),
};

const loginItems = { set: () => {}, get: () => ({ openAtLogin: false }) };

describe("createStartupRegistration", () => {
  it("Without an entry the option is unavailable and applying does nothing", async () => {
    const registration = createStartupRegistration(undefined, () => {});

    const applied = await registration.apply(true);

    expect(registration.available).toBe(false);
    expect(applied).toBe(false);
  });

  it("Enabling writes the entry and disabling removes it", async () => {
    const entry = new RecordingEntry();
    const registration = createStartupRegistration(entry, () => {});

    const enabled = await registration.apply(true);
    const disabled = await registration.apply(false);

    expect(registration.available).toBe(true);
    expect([enabled, disabled]).toEqual([true, true]);
    expect(entry.applied).toEqual(["write", "remove"]);
  });

  it("A refused write is reported instead of thrown", async () => {
    const warnings: string[] = [];
    const registration = createStartupRegistration(refusingEntry, (message) => {
      warnings.push(message);
    });

    const applied = await registration.apply(true);

    expect(applied).toBe(false);
    expect(warnings).toEqual(["Could not update the start-with-system entry: Access denied."]);
  });
});

describe("startupEntryFor", () => {
  it("An uninstalled build has no start-with-system entry", () => {
    const entry = startupEntryFor(undefined, {
      environment: {},
      homeDirectory: "/home/alex",
      loginItems,
    });

    expect(entry).toBeUndefined();
  });

  it("An AppImage gets an autostart file that starts the stable AppImage path", async () => {
    const home = await mkdtemp(join(tmpdir(), "task-tracker-home-"));
    try {
      const entry = startupEntryFor(
        { kind: "appimage", path: "/opt/TaskTracker.AppImage" },
        { environment: { XDG_CONFIG_HOME: "relative" }, homeDirectory: home, loginItems },
      );

      await entry?.write();

      expect(
        (await stat(join(home, ".config", "autostart", "task-tracker.desktop"))).isFile(),
      ).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
