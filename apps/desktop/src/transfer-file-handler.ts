import { type BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from "electron";
import {
  checkedTransferPath,
  choiceFor,
  grantFor,
  parseTransferRequest,
  suggestedFileName,
  testFilePath,
  type TransferGrant,
  type TransferRequest,
} from "./transfer-file-dialog.js";

const JSON_FILTER = [{ name: "JSON files", extensions: ["json"] }];

/** What the handler needs from main: frame checks, the owner window and the server pipe. */
export interface TransferFileHost {
  readonly isRendererFrame: (event: IpcMainInvokeEvent) => boolean;
  readonly window: () => BrowserWindow | undefined;
  /** Writes a grant to the running server; false when no server is running. */
  readonly grant: (grant: TransferGrant) => boolean;
}

async function showDialog(
  request: TransferRequest,
  owner: BrowserWindow,
): Promise<string | undefined> {
  if (request.purpose === "export-json") {
    const result = await dialog.showSaveDialog(owner, {
      title: "Export JSON",
      defaultPath: suggestedFileName(request.suggestedName),
      filters: JSON_FILTER,
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    return result.canceled ? undefined : result.filePath;
  }
  const result = await dialog.showOpenDialog(owner, {
    title: "Import JSON",
    filters: JSON_FILTER,
    properties: ["openFile"],
  });
  return result.canceled ? undefined : result.filePaths[0];
}

async function choose(host: TransferFileHost, request: TransferRequest) {
  const owner = host.window();
  if (owner === undefined) {
    return null;
  }
  const chosen = testFilePath() ?? (await showDialog(request, owner));
  const path = checkedTransferPath(chosen, request.purpose === "export-json");
  if (path === undefined) {
    return null;
  }
  const grant = grantFor(path, request);
  return host.grant(grant) ? choiceFor(grant) : null;
}

/**
 * Handles the renderer's one file call (§4, §7.9): main shows the native dialog,
 * hands the chosen path to the server privately and returns only a token. The
 * renderer can never name a path itself. Cancelling returns null.
 */
export function registerTransferFileHandler(host: TransferFileHost) {
  ipcMain.handle("task-tracker:choose-transfer-file", async (event, value: unknown) => {
    const request = host.isRendererFrame(event) ? parseTransferRequest(value) : undefined;
    return request === undefined ? null : choose(host, request);
  });
}
