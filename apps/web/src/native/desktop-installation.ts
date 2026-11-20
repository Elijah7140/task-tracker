import { DesktopInstallation, UpdateCheckResult } from "@task-tracker/contracts";
import { Option, Schema } from "effect";

/** What Electron main reports about this build (§7.13). */
export type DesktopInstallationInfo = typeof DesktopInstallation.Type;

/** What a manual check for updates found. */
export type UpdateCheck = typeof UpdateCheckResult.Type;

/** The update calls App Settings makes. Failures resolve as failures and never throw. */
export interface InstallationBridge {
  readonly check: () => Promise<UpdateCheck>;
  readonly download: () => Promise<boolean>;
  readonly restart: () => Promise<boolean>;
}

const decodeInstallation = Schema.decodeUnknownOption(DesktopInstallation);
const decodeCheck = Schema.decodeUnknownOption(UpdateCheckResult);

const FAILED_CHECK: UpdateCheck = { outcome: "failed" };

/** Calls a bridge method, treating a missing method or a rejection as `undefined`. */
async function ask(call: (() => Promise<unknown>) | undefined): Promise<unknown> {
  try {
    return await call?.();
  } catch {
    return undefined;
  }
}

/**
 * Reads the installed-build state from the desktop shell. Undefined outside
 * Electron, where App Settings shows no About card or start-with-system option.
 */
export async function readDesktopInstallation(): Promise<DesktopInstallationInfo | undefined> {
  const bridge = window.taskTrackerDesktop;
  return Option.getOrUndefined(decodeInstallation(await ask(bridge?.getInstallation)));
}

/** The update calls through the isolated preload, validating each answer. */
export function desktopInstallationBridge(): InstallationBridge {
  return {
    check: async () => {
      const answer = await ask(window.taskTrackerDesktop?.checkForUpdates);
      return Option.getOrElse(decodeCheck(answer), () => FAILED_CHECK);
    },
    download: async () => (await ask(window.taskTrackerDesktop?.downloadUpdate)) === true,
    restart: async () => (await ask(window.taskTrackerDesktop?.restartToUpdate)) === true,
  };
}

/** Writes or removes the start-with-system entry after a save. False if the system refused. */
export async function applyStartWithSystem(enabled: boolean): Promise<boolean> {
  const apply = window.taskTrackerDesktop?.applyStartWithSystem;
  return (await ask(apply === undefined ? undefined : () => apply(enabled))) === true;
}
