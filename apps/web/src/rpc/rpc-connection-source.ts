import { RpcConnection, type TransferFileRequest } from "@task-tracker/contracts";
import { Option, Schema } from "effect";

/** The narrow API the isolated Electron preload exposes as `window.taskTrackerDesktop`. */
export interface DesktopBridge {
  getRpcConnection(): Promise<unknown>;
  openExternalLink(address: string): Promise<boolean>;
  /**
   * Shows a native save or open dialog for a transfer and resolves with the
   * chosen file's token and name (as `TransferFileChoice`), or null when the
   * user cancels. Missing in builds without import and export.
   */
  readonly chooseTransferFile?: (request: typeof TransferFileRequest.Type) => Promise<unknown>;
  /** Calls `listener` when a reminder notification is clicked. Returns the unsubscribe. */
  onReminderActivated?(listener: (activation: unknown) => void): () => void;
  /** The build version and installed-build state, as `DesktopInstallation` (§7.13). */
  readonly getInstallation?: () => Promise<unknown>;
  /** Asks main to check the release feed. Resolves with an `UpdateCheckResult`. */
  readonly checkForUpdates?: () => Promise<unknown>;
  /** Downloads and verifies the update the last check found. Resolves true when ready. */
  readonly downloadUpdate?: () => Promise<unknown>;
  /** Quits and installs the verified update. Resolves true once main is quitting. */
  readonly restartToUpdate?: () => Promise<unknown>;
  /** Writes or removes the start-with-system entry. Resolves true when it succeeded. */
  readonly applyStartWithSystem?: (enabled: boolean) => Promise<unknown>;
}

declare global {
  interface Window {
    readonly taskTrackerDesktop?: DesktopBridge;
  }
}

const decodeConnection = Schema.decodeUnknownOption(RpcConnection);

/** Validates the current launch's connection details from the isolated preload. */
export async function readRpcConnection(
  bridge: Pick<DesktopBridge, "getRpcConnection"> | undefined,
) {
  return Option.getOrUndefined(decodeConnection(await bridge?.getRpcConnection()));
}
