import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const script = new URL("../../installer/uninstall-startup.nsh", import.meta.url);
const runKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

describe("uninstall-startup.nsh", () => {
  it("Removes the app's Run value on uninstall but not during an update", async () => {
    const text = await readFile(script, "utf8");

    const guarded = text.slice(text.indexOf("${ifNot} ${isUpdated}"), text.indexOf("${endIf}"));

    expect(text).toContain("!macro customUnInstall");
    expect(guarded).toContain(`DeleteRegValue HKCU "${runKey}" "app.tasktracker.desktop"`);
  });

  it("Names the value Electron's login item API writes for the app", async () => {
    const main = await readFile(new URL("../../src/main.ts", import.meta.url), "utf8");

    const appUserModelId = /setAppUserModelId\("([^"]+)"\)/.exec(main)?.[1];

    expect(appUserModelId).toBe("app.tasktracker.desktop");
  });
});
