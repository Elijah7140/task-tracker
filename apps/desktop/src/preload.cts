import electron = require("electron");

const REMINDER_ACTIVATED_CHANNEL = "task-tracker:reminder-activated";
const reminderListeners = new Set<(activation: unknown) => void>();
// A click that started the app can arrive before the page subscribes; it waits here.
const waitingActivations: unknown[] = [];

electron.ipcRenderer.on(REMINDER_ACTIVATED_CHANNEL, (_event: unknown, activation: unknown) => {
  if (reminderListeners.size === 0) {
    waitingActivations.push(activation);
  }
  for (const listener of reminderListeners) {
    listener(activation);
  }
});

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
    const forward = (activation: unknown) => listener(activation);
    reminderListeners.add(forward);
    for (const activation of waitingActivations.splice(0)) {
      forward(activation);
    }
    return () => {
      reminderListeners.delete(forward);
    };
  },
  // Installed-build controls (§7.13). Main owns the feed, downloads and OS entry.
  getInstallation: (): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:get-installation"),
  checkForUpdates: (): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:check-for-updates"),
  downloadUpdate: (): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:download-update"),
  restartToUpdate: (): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:restart-to-update"),
  applyStartWithSystem: (enabled: boolean): Promise<unknown> =>
    electron.ipcRenderer.invoke("task-tracker:apply-start-with-system", enabled === true),
});
