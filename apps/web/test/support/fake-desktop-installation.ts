import type { DesktopInstallation, UpdateCheckResult } from "@task-tracker/contracts";
import { vi } from "vitest";

/**
 * The installed-build half of the desktop preload, with scripted answers.
 * `downloadGate` holds a download open until the test releases it.
 */
export class FakeDesktopInstallation {
  installation: typeof DesktopInstallation.Type = {
    version: "0.1.0",
    canUpdate: true,
    startWithSystemAvailable: true,
    readyVersion: null,
  };
  checkResult: typeof UpdateCheckResult.Type = { outcome: "up-to-date" };
  downloadSucceeds = true;
  restartSucceeds = true;
  startupSucceeds = true;
  readonly applied: boolean[] = [];
  checkCount = 0;
  downloadCount = 0;
  restartCount = 0;
  private gate: Promise<void> | undefined;
  private release = () => {};

  /** Holds the next downloads open until {@link releaseDownload}. */
  holdDownload() {
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  releaseDownload() {
    this.release();
  }

  /** Installs this fake as `window.taskTrackerDesktop`. Undo with `vi.unstubAllGlobals()`. */
  install() {
    vi.stubGlobal("taskTrackerDesktop", {
      getRpcConnection: async () => undefined,
      openExternalLink: async () => false,
      getInstallation: async () => this.installation,
      checkForUpdates: async () => {
        this.checkCount++;
        return this.checkResult;
      },
      downloadUpdate: async () => {
        this.downloadCount++;
        await this.gate;
        return this.downloadSucceeds;
      },
      restartToUpdate: async () => {
        this.restartCount++;
        return this.restartSucceeds;
      },
      applyStartWithSystem: async (enabled: boolean) => {
        this.applied.push(enabled);
        return this.startupSucceeds;
      },
    });
    return this;
  }
}
