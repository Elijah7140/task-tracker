import type { PendingRelaunch, RelaunchCommand } from "./relaunch-after-exit.js";

/** The two ways to start the app again after it quits. */
export interface RelaunchMethods {
  /** Starts the command once this process exits, or returns nothing where the OS cannot. */
  readonly afterExit: (command: RelaunchCommand) => PendingRelaunch | undefined;
  /** Electron's `app.relaunch()`, which keeps this process's environment. */
  readonly electron: (options: { execPath: string; args: string[] }) => void;
}

/**
 * Starts `command` again once the app has quit. Linux prefers the waiting
 * helper, because Electron's relaunch sets no-new-privileges, under which
 * neither the setuid `chrome-sandbox` nor the AppImage runtime's `fusermount3`
 * can gain root. Other platforms, or a helper that cannot start, use Electron.
 */
export function relaunchOnExit(command: RelaunchCommand, methods: RelaunchMethods) {
  if (methods.afterExit(command) === undefined) {
    methods.electron({ execPath: command.executable, args: [...command.args] });
  }
}
