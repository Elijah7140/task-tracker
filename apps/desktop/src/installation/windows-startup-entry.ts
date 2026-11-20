import type { StartupEntry } from "./startup-registration.js";

/** The Windows options of Electron's `app.setLoginItemSettings`. */
export interface LoginItemSettings {
  readonly openAtLogin: boolean;
  readonly path: string;
  readonly args: readonly string[];
}

/** The Windows options of Electron's `app.getLoginItemSettings`. */
export interface LoginItemQuery {
  readonly path: string;
  readonly args: readonly string[];
}

/**
 * Electron's per-user login item API. On Windows it writes the value named for
 * the app's AppUserModelID under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
 */
export interface LoginItems {
  readonly set: (settings: LoginItemSettings) => void;
  readonly get: (query: LoginItemQuery) => { readonly openAtLogin: boolean };
}

/**
 * Starts the installed app at sign-in through the per-user `Run` key (§7.13). The
 * installer keeps the executable at a stable path across updates. Electron's API
 * reports no failure, so each change is read back and a mismatch is an error.
 */
export function windowsStartupEntry(loginItems: LoginItems, executablePath: string): StartupEntry {
  const apply = (openAtLogin: boolean) => {
    loginItems.set({ openAtLogin, path: executablePath, args: [] });
    if (loginItems.get({ path: executablePath, args: [] }).openAtLogin !== openAtLogin) {
      return Promise.reject(new Error("The start-with-system entry was not updated."));
    }
    return Promise.resolve();
  };
  return { write: () => apply(true), remove: () => apply(false) };
}
