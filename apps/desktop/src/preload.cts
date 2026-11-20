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
  // Main accepts this only from the tray card window and validates the ID (§7.18).
  openItemFromTrayCard: (itemId: string): Promise<boolean> =>
    electron.ipcRenderer.invoke("task-tracker:open-item-from-tray-card", itemId),
  // The tray card reports its drawn height so main can fit the window to it.
  reportTrayCardHeight: (height: number): void => {
    electron.ipcRenderer.send("task-tracker:tray-card-height", height);
  },
  // Passes only the payload on, never the IPC event. The renderer validates it.
  onReminderActivated: (listener: (activation: unknown) => void): (() => void) => {
    const forward = (_event: unknown, activation: unknown) => listener(activation);
    electron.ipcRenderer.on("task-tracker:reminder-activated", forward);
    return () => {
      electron.ipcRenderer.off("task-tracker:reminder-activated", forward);
    };
  },
});
