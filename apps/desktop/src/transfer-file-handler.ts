import { type BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from "electron";
import {
  checkedTransferPath,
  choiceFor,
  grantFor,
  parseTransferRequest,
  suggestedFileName,
  testFilePath,
  transferKind,
  type TransferGrant,
  type TransferKind,
  type TransferRequest,
} from "./transfer-file-dialog.js";

const FILTERS: Record<TransferKind, Electron.FileFilter[]> = {
  json: [{ name: "JSON files", extensions: ["json"] }],
  csv: [{ name: "CSV files", extensions: ["csv"] }],
};

const LABELS: Record<TransferKind, string> = { json: "JSON", csv: "CSV" };

/** What the handler needs from main: frame checks, the owner window and the server pipe. */
export interface TransferFileHost {
  readonly isRendererFrame: (event: IpcMainInvokeEvent) => boolean;
  readonly window: () => BrowserWindow | undefined;
  /** Writes a grant to the running server; false when no server is running. */
  readonly grant: (grant: TransferGrant) => boolean;
}

const isExport = (request: TransferRequest) => request.purpose.startsWith("export-");

async function showDialog(
  request: TransferRequest,
  owner: BrowserWindow,
): Promise<string | undefined> {
  const kind = transferKind(request.purpose);
  if (isExport(request)) {
    const result = await dialog.showSaveDialog(owner, {
      title: `Export ${LABELS[kind]}`,
      defaultPath: suggestedFileName(request.suggestedName, kind),
      filters: FILTERS[kind],
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    return result.canceled ? undefined : result.filePath;
  }
  const result = await dialog.showOpenDialog(owner, {
    title: `Import ${LABELS[kind]}`,
    filters: FILTERS[kind],
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
  const path = checkedTransferPath(chosen, isExport(request), transferKind(request.purpose));
  if (path === undefined) {
    return null;
  }
  const grant = grantFor(path, request);
  return host.grant(grant) ? choiceFor(grant) : null;
}

/**
 * Handles the renderer's one file call (§4, §7.9) for JSON and CSV: main shows the native dialog,
 * hands the chosen path to the server privately and returns only a token. The
 * renderer can never name a path itself. Cancelling returns null.
 */
export function registerTransferFileHandler(host: TransferFileHost) {
  ipcMain.handle("task-tracker:choose-transfer-file", async (event, value: unknown) => {
    const request = host.isRendererFrame(event) ? parseTransferRequest(value) : undefined;
    return request === undefined ? null : choose(host, request);
  });
}
