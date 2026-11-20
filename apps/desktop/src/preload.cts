import electron = require("electron");

// Sandboxed Electron preloads use CommonJS and a restricted require.
electron.contextBridge.exposeInMainWorld("taskTrackerDesktop", {
  getRpcConnection: (): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:get-rpc-connection"),
  openExternalLink: (address: string): Promise<boolean> =>
    electron.ipcRenderer.invoke("task-tracker:open-external-link", address),
  // Main validates the request and returns only a token for the chosen file, or null.
  chooseTransferFile: (request: unknown): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:choose-transfer-file", request),
});
