import type { InstalledApp } from "./installed-app.js";
import { linuxStartupEntry, resolveConfigDirectory } from "./linux-startup-entry.js";
import type { StartupEntry } from "./startup-registration.js";
import { type LoginItems, windowsStartupEntry } from "./windows-startup-entry.js";

/** What the entries read from the user's environment. */
export interface StartupContext {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  readonly loginItems: LoginItems;
}

/**
 * The start-with-system entry for the installed build: the per-user Run key on
 * Windows or an autostart file for the stable AppImage path on Linux. Builds that
 * are not installed have no stable path, so they get none (§7.13).
 */
export function startupEntryFor(
  installed: InstalledApp | undefined,
  context: StartupContext,
): StartupEntry | undefined {
  if (installed === undefined) {
    return undefined;
  }
  if (installed.kind === "windows-installer") {
    return windowsStartupEntry(context.loginItems, installed.executable);
  }
  const config = resolveConfigDirectory(context.environment.XDG_CONFIG_HOME, context.homeDirectory);
  return linuxStartupEntry(config, installed.path);
}
