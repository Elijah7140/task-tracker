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
  /**
   * From the tray card window only: hides the card, brings the main window
   * forward and opens the item there (§7.18). Resolves false when main refuses.
   */
  readonly openItemFromTrayCard?: (itemId: string) => Promise<boolean>;
  /** From the tray card window only: reports the card's drawn height so main fits the window. */
  readonly reportTrayCardHeight?: (height: number) => void;
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
