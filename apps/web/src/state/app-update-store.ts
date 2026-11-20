import { createStore, type StoreApi } from "zustand/vanilla";
import {
  desktopInstallationBridge,
  type InstallationBridge,
  type UpdateCheck,
} from "../native/desktop-installation.js";

/** The legacy App Settings update messages (§7.13). */
export const UPDATE_TEXT = {
  checking: "Checking for updates…",
  upToDate: "Task Tracker is up to date.",
  checkFailed: "Couldn't check for updates. Check your internet connection and try again.",
  feedUnavailable:
    "No update feed is available yet. Releases are published to a private or missing repository.",
  notInstalled: "Updates are available only in installed builds.",
  downloadFailed: "Couldn't download the update. Check your internet connection and try again.",
  readyToRestart:
    "Ready to restart. The update will be installed the next time Task Tracker starts.",
  restartFailed:
    "Couldn't restart to update. The update will be installed the next time Task Tracker starts.",
  restarting: "Restarting to finish the update…",
  available: (version: string) => `Version ${version} is available.`,
  downloading: (version: string) => `Downloading version ${version}…`,
} as const;

/**
 * The Check for updates part of App Settings. It lives outside the page, so a
 * download and its ready state survive navigation. The app checks only when
 * the user asks, so it makes no network request on its own.
 */
export interface AppUpdateState {
  readonly status: string | null;
  readonly busy: boolean;
  /** The release the last check offered, until it is downloaded. */
  readonly availableVersion: string | null;
  readonly readyToRestart: boolean;
  readonly canCheck: () => boolean;
  readonly canDownload: () => boolean;
  readonly canRestart: () => boolean;
  readonly check: () => Promise<void>;
  readonly download: () => Promise<void>;
  /** Restarts after `confirmLeave` resolves the open drafts; declining keeps the update ready. */
  readonly restart: (confirmLeave: () => Promise<boolean>) => Promise<void>;
  /** Shows a download main already verified, as after the window reloads. */
  readonly showReady: () => void;
}

function checkStatus(result: UpdateCheck): string {
  switch (result.outcome) {
    case "up-to-date":
      return UPDATE_TEXT.upToDate;
    case "available":
      return UPDATE_TEXT.available(result.version);
    case "feed-unavailable":
      return UPDATE_TEXT.feedUnavailable;
    case "not-installed":
      return UPDATE_TEXT.notInstalled;
    case "failed":
      return UPDATE_TEXT.checkFailed;
  }
}

type SetState = StoreApi<AppUpdateState>["setState"];
type GetState = StoreApi<AppUpdateState>["getState"];

function updateActions(bridge: InstallationBridge, set: SetState, get: GetState) {
  const check = async () => {
    set({ availableVersion: null, busy: true, status: UPDATE_TEXT.checking });
    const result = await bridge.check();
    const availableVersion = result.outcome === "available" ? result.version : null;
    set({ busy: false, availableVersion, status: checkStatus(result) });
  };
  const download = async () => {
    set({ busy: true, status: UPDATE_TEXT.downloading(get().availableVersion ?? "?") });
    if (await bridge.download()) {
      set({ busy: false, availableVersion: null, readyToRestart: true });
      set({ status: UPDATE_TEXT.readyToRestart });
    } else {
      set({ busy: false, status: UPDATE_TEXT.downloadFailed });
    }
  };
  const restart = async (confirmLeave: () => Promise<boolean>) => {
    set({ busy: true });
    if (!(await confirmLeave())) {
      set({ busy: false, status: UPDATE_TEXT.readyToRestart });
    } else if (await bridge.restart()) {
      set({ status: UPDATE_TEXT.restarting });
    } else {
      set({ busy: false, status: UPDATE_TEXT.restartFailed });
    }
  };
  return { check, download, restart };
}

/** No check made and nothing downloaded, as on launch. */
export const initialAppUpdateValues = {
  status: null,
  busy: false,
  availableVersion: null,
  readyToRestart: false,
} as const satisfies Partial<AppUpdateState>;

/** Creates the update state over `bridge`; tests pass a fake feed. */
export function createAppUpdateStore(bridge: InstallationBridge): StoreApi<AppUpdateState> {
  return createStore<AppUpdateState>()((set, get) => ({
    ...initialAppUpdateValues,
    canCheck: () => !get().busy && !get().readyToRestart,
    canDownload: () => get().availableVersion !== null && !get().busy,
    canRestart: () => get().readyToRestart && !get().busy,
    ...updateActions(bridge, set, get),
    showReady: () => {
      if (!get().readyToRestart && !get().busy) {
        set({ availableVersion: null, readyToRestart: true, status: UPDATE_TEXT.readyToRestart });
      }
    },
  }));
}

/** The app's one update state, over the desktop preload. */
export const appUpdateStore = createAppUpdateStore(desktopInstallationBridge());
