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
  // Passes only the payload on, never the IPC event. The renderer validates it.
  onReminderActivated: (listener: (activation: unknown) => void): (() => void) => {
    const forward = (_event: unknown, activation: unknown) => listener(activation);
    electron.ipcRenderer.on("task-tracker:reminder-activated", forward);
    return () => {
      electron.ipcRenderer.off("task-tracker:reminder-activated", forward);
    };
  },
});
