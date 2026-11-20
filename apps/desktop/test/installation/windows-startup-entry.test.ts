import { describe, expect, it } from "vitest";
import {
  type LoginItemQuery,
  type LoginItems,
  type LoginItemSettings,
  windowsStartupEntry,
} from "../../src/installation/windows-startup-entry.js";

const EXECUTABLE = "C:\\Users\\alex\\AppData\\Local\\Programs\\task-tracker\\task-tracker.exe";
const APP_VALUE = "app.tasktracker.desktop";

/** An in-memory stand-in for the per-user Run key that Electron's login item API writes. */
class FakeLoginItems implements LoginItems {
  readonly values = new Map<string, string>();
  refuses = false;

  set(settings: LoginItemSettings) {
    if (this.refuses) {
      return;
    }
    if (settings.openAtLogin) {
      this.values.set(APP_VALUE, [`"${settings.path}"`, ...settings.args].join(" "));
    } else {
      this.values.delete(APP_VALUE);
    }
  }

  get(query: LoginItemQuery) {
    return { openAtLogin: this.values.get(APP_VALUE) === `"${query.path}"` };
  }
}

describe("windowsStartupEntry", () => {
  it("Writing registers the installed executable without arguments", async () => {
    const loginItems = new FakeLoginItems();

    await windowsStartupEntry(loginItems, EXECUTABLE).write();

    expect(loginItems.values.get(APP_VALUE)).toBe(`"${EXECUTABLE}"`);
  });

  it("Writing twice keeps one value", async () => {
    const loginItems = new FakeLoginItems();
    const entry = windowsStartupEntry(loginItems, EXECUTABLE);

    await entry.write();
    await entry.write();

    expect(loginItems.values.size).toBe(1);
  });

  it("Removing deletes only the app value", async () => {
    const loginItems = new FakeLoginItems();
    loginItems.values.set("OtherApp", "other.exe");
    const entry = windowsStartupEntry(loginItems, EXECUTABLE);
    await entry.write();

    await entry.remove();

    expect([...loginItems.values.keys()]).toEqual(["OtherApp"]);
  });

  it("Removing a missing entry does nothing", async () => {
    const loginItems = new FakeLoginItems();

    await windowsStartupEntry(loginItems, EXECUTABLE).remove();

    expect(loginItems.values.size).toBe(0);
  });

  it("A write the system ignored is reported as a failure", async () => {
    const loginItems = new FakeLoginItems();
    loginItems.refuses = true;

    const written = windowsStartupEntry(loginItems, EXECUTABLE).write();

    await expect(written).rejects.toThrow("The start-with-system entry was not updated.");
  });
});
