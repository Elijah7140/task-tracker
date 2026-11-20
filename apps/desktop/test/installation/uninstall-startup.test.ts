import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { INSTALLER_CACHE_FOLDER } from "../../src/installation/installer-cache.js";
import { INSTALLED_IDENTITY } from "../../src/windows-app-identity.js";

const script = new URL("../../installer/uninstall-startup.nsh", import.meta.url);
const leftovers = new URL("../../installer/uninstall-leftovers.nsh", import.meta.url);
const runKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

/** The uninstall steps that run only when the uninstaller was not started by an update. */
async function guardedSteps() {
  const text = await readFile(script, "utf8");
  return text.slice(text.indexOf("${ifNot} ${isUpdated}"), text.indexOf("${endIf}"));
}

/** The body of one `!macro` in uninstall-leftovers.nsh. */
async function leftoverMacro(name: string) {
  const text = await readFile(leftovers, "utf8");
  const start = text.indexOf(`!macro ${name}`);
  return start === -1 ? "" : text.slice(start, text.indexOf("!macroend", start));
}

describe("uninstall-startup.nsh", () => {
  it("Removes the app's Run value on uninstall but not during an update", async () => {
    const text = await readFile(script, "utf8");

    const guarded = await guardedSteps();

    expect(text).toContain("!macro customUnInstall");
    expect(guarded).toContain(`DeleteRegValue HKCU "${runKey}" "app.tasktracker.desktop"`);
  });

  it("Names the value Electron's login item API writes for the installed app", async () => {
    const packaging = await readFile(new URL("../../scripts/package.mjs", import.meta.url), "utf8");

    const appId = /appId: "([^"]+)"/.exec(packaging)?.[1];

    expect(INSTALLED_IDENTITY.appUserModelId).toBe("app.tasktracker.desktop");
    expect(appId).toBe(INSTALLED_IDENTITY.appUserModelId);
  });

  it("Removes the installer cache and the toast activator on uninstall but not during an update", async () => {
    const text = await readFile(script, "utf8");

    const guarded = await guardedSteps();

    expect(text).toContain('!include "${__FILEDIR__}\\uninstall-leftovers.nsh"');
    expect(guarded).toContain("!insertmacro removeUpdaterCache");
    expect(guarded).toContain("!insertmacro removeToastActivator");
  });
});

describe("uninstall-leftovers.nsh", () => {
  it("Deletes the folder electron-builder's installer copies itself into", async () => {
    const macro = await leftoverMacro("removeUpdaterCache");

    expect(macro).toContain(`RMDir /r "$LOCALAPPDATA\\${INSTALLER_CACHE_FOLDER}"`);
  });

  it("Deletes the per-user COM entry of the installed app's toast activator", async () => {
    const macro = await leftoverMacro("removeToastActivator");

    expect(macro).toContain(
      `DeleteRegKey HKCU "Software\\Classes\\CLSID\\${INSTALLED_IDENTITY.toastActivatorClsid}"`,
    );
  });
});
