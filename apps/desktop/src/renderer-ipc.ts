import { externalLinkAddress, Guid, type RpcConnection } from "@task-tracker/contracts";
import { ipcMain, shell } from "electron";
import { Option, Schema } from "effect";
import type { AuxiliaryWindows } from "./auxiliary-windows.js";
import type { FrameGuard } from "./frame-guard.js";

/** What the renderer handlers need from Electron main. */
export interface RendererIpcHost {
  /** Accepts calls from the app window's main frame at the renderer page. */
  readonly isRendererFrame: FrameGuard;
  readonly windows: AuxiliaryWindows;
  /** The live server connection, or nothing while the server is down. */
  readonly connection: () => RpcConnection | undefined;
  /** Brings the app window forward and opens the item there, as reminder activation does. */
  readonly openItem: (itemId: string) => void;
}

const decodeItemId = Schema.decodeUnknownOption(Guid);

/** Hides the card and opens a valid item in the app window. */
function openItemFromTrayCard(host: RendererIpcHost, value: unknown) {
  const itemId = Option.getOrUndefined(decodeItemId(value));
  if (itemId === undefined) {
    return false;
  }
  host.windows.trayCard.hide();
  host.openItem(itemId);
  return true;
}

/** Hides the card and shows its stack in the window that stays open (§7.18). */
function popOutTrayCard({ trayCard, inProgress }: AuxiliaryWindows) {
  trayCard.hide();
  inProgress.show();
  return true;
}

/** Opens a link in the system browser. Only addresses the contract allows get that far. */
async function openExternalLink(value: unknown) {
  const link = externalLinkAddress(value);
  if (link === undefined) {
    return false;
  }
  try {
    await shell.openExternal(link);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers the calls the app window and the windows beside it make to Electron
 * main (§4). Each handler checks the calling frame first and treats every
 * argument as untrusted.
 */
export function registerRendererIpc(host: RendererIpcHost) {
  const { isRendererFrame, windows } = host;
  const { isTrayCardFrame, isInProgressFrame, isTicketBatchFrame } = windows;

  ipcMain.handle("task-tracker:get-rpc-connection", (event) => {
    const allowed =
      isRendererFrame(event) ||
      isTrayCardFrame(event) ||
      isInProgressFrame(event) ||
      isTicketBatchFrame(event);
    if (!allowed) {
      throw new Error("RPC connection requested by an unexpected frame.");
    }
    return host.connection();
  });
  ipcMain.handle("task-tracker:open-item-from-tray-card", (event, value: unknown) =>
    isTrayCardFrame(event) || isInProgressFrame(event) ? openItemFromTrayCard(host, value) : false,
  );
  ipcMain.handle("task-tracker:pop-out-tray-card", (event) =>
    isTrayCardFrame(event) ? popOutTrayCard(windows) : false,
  );
  ipcMain.handle("task-tracker:set-in-progress-window-on-top", (event, value: unknown) =>
    isInProgressFrame(event) ? windows.inProgress.setAlwaysOnTop(value) : false,
  );
  ipcMain.on("task-tracker:tray-card-size", (event, width: unknown, height: unknown) => {
    if (isTrayCardFrame(event)) {
      windows.trayCard.resize(width, height);
    }
  });
  ipcMain.on("task-tracker:tray-card-hold", (event, hold: unknown) => {
    if (isTrayCardFrame(event)) {
      windows.trayCard.hold(hold);
    }
  });
  ipcMain.handle("task-tracker:open-external-link", (event, value: unknown) =>
    isRendererFrame(event) ? openExternalLink(value) : false,
  );
}
