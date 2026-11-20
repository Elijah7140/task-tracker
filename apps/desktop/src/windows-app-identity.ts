/**
 * How Windows recognises one build of the app: its AppUserModelID groups its
 * windows and names its notifications, and its toast activator CLSID is the COM
 * class Windows starts when a notification is clicked in the notification
 * centre (§7.12).
 */
export interface WindowsAppIdentity {
  readonly appUserModelId: string;
  /** A brace-wrapped CLSID, as `app.setToastActivatorCLSID` takes it. */
  readonly toastActivatorClsid: string;
}

/**
 * The installed build. The AppUserModelID is electron-builder's `appId`, which
 * the installer writes to its Start-menu shortcut and which names the Run value
 * of the login item. The CLSID is fixed so every run, update and the
 * uninstaller agree on it.
 */
export const INSTALLED_IDENTITY: WindowsAppIdentity = {
  appUserModelId: "app.tasktracker.desktop",
  toastActivatorClsid: "{93603194-4CCF-41CE-984E-774763DBDB43}",
};

/** The unpacked copy the packaged smoke tests drive. */
export const UNPACKED_IDENTITY: WindowsAppIdentity = {
  appUserModelId: "app.tasktracker.desktop.unpacked",
  toastActivatorClsid: "{FAC71C45-E5AD-4A0C-9BD9-4F1DCAF147CF}",
};

/** Development runs on the stock Electron executable. */
export const DEVELOPMENT_IDENTITY: WindowsAppIdentity = {
  appUserModelId: "app.tasktracker.desktop.dev",
  toastActivatorClsid: "{4CC23F67-A13A-442E-90AD-0ED3800D6AE9}",
};

/** What the identity depends on. */
export interface WindowsBuild {
  readonly isPackaged: boolean;
  /** Whether this is the per-user NSIS installation. */
  readonly installed: boolean;
}

/**
 * Picks the identity for this build. Electron points the Start-menu shortcut and
 * the CLSID's COM server at whichever executable registers them, so builds that
 * are not installed use their own identity and never take over the installed
 * app's notifications.
 */
export function windowsAppIdentity(build: WindowsBuild): WindowsAppIdentity {
  if (build.installed) {
    return INSTALLED_IDENTITY;
  }
  return build.isPackaged ? UNPACKED_IDENTITY : DEVELOPMENT_IDENTITY;
}
