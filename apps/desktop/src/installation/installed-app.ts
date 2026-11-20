import { posix, win32 } from "node:path";

/**
 * An installed build that can update itself and start with the system (§7.13):
 * the per-user Windows installation, or the AppImage file that started the app.
 */
export type InstalledApp =
  | { readonly kind: "windows-installer"; readonly executable: string }
  | { readonly kind: "appimage"; readonly path: string };

/** What detection reads from the running process. */
export interface InstallProbe {
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  /** The running executable, `process.execPath`. */
  readonly executable: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Whether a regular file exists at `path`, without following a symbolic link. */
  readonly isFile: (path: string) => boolean;
}

/** The per-user NSIS installation keeps its uninstaller beside the executable (WP41). */
const WINDOWS_UNINSTALLER = "Uninstall Task Tracker.exe";

function windowsInstallation(probe: InstallProbe): InstalledApp | undefined {
  const uninstaller = win32.join(win32.dirname(probe.executable), WINDOWS_UNINSTALLER);
  return probe.isFile(uninstaller)
    ? { kind: "windows-installer", executable: probe.executable }
    : undefined;
}

/** The AppImage runtime names the file it mounted in `APPIMAGE`; the mounted copy moves each run. */
function appImageInstallation(probe: InstallProbe): InstalledApp | undefined {
  const path = probe.environment.APPIMAGE;
  return path !== undefined && posix.isAbsolute(path) && probe.isFile(path)
    ? { kind: "appimage", path }
    : undefined;
}

/**
 * Finds the installed build, if any. Development, unpacked and portable builds,
 * and macOS, are not installed: they never update themselves or register to
 * start with the system.
 */
export function detectInstalledApp(probe: InstallProbe): InstalledApp | undefined {
  if (!probe.isPackaged) {
    return undefined;
  }
  if (probe.platform === "win32") {
    return windowsInstallation(probe);
  }
  return probe.platform === "linux" ? appImageInstallation(probe) : undefined;
}
