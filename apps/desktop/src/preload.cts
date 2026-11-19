import electron = require("electron");

// Sandboxed Electron preloads use CommonJS and a restricted require.
electron.contextBridge.exposeInMainWorld("taskTrackerDesktop", {
  getRpcConnection: (): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:get-rpc-connection"),
  openExternalLink: (address: string): Promise<boolean> =>
    electron.ipcRenderer.invoke("task-tracker:open-external-link", address),
});
