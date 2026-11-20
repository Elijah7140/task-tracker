import { describe, expect, it } from "vitest";
import type { InstallationBridge, UpdateCheck } from "../../src/native/desktop-installation.js";
import { createAppUpdateStore, UPDATE_TEXT } from "../../src/state/app-update-store.js";

/** A release feed with scripted answers. A gate holds a check or download open. */
class FakeInstallationBridge implements InstallationBridge {
  checkResult: UpdateCheck = { outcome: "up-to-date" };
  downloadSucceeds = true;
  restartSucceeds = true;
  checkGate: Promise<void> | undefined;
  checkCount = 0;
  downloadCount = 0;
  restartCount = 0;

  async check() {
    this.checkCount++;
    await this.checkGate;
    return this.checkResult;
  }

  download() {
    this.downloadCount++;
    return Promise.resolve(this.downloadSucceeds);
  }

  restart() {
    this.restartCount++;
    return Promise.resolve(this.restartSucceeds);
  }
}

const allowRestart = () => Promise.resolve(true);
const declineRestart = () => Promise.resolve(false);

function createPage(bridge: FakeInstallationBridge) {
  const store = createAppUpdateStore(bridge);
  return { store, state: () => store.getState() };
}

async function readyToRestart(bridge: FakeInstallationBridge) {
  bridge.checkResult = { outcome: "available", version: "0.2.0" };
  const page = createPage(bridge);
  await page.state().check();
  await page.state().download();
  return page;
}

describe("createAppUpdateStore", () => {
  it("Checking shows a checking status until the feed answers", async () => {
    const bridge = new FakeInstallationBridge();
    let release = () => {};
    bridge.checkGate = new Promise((resolve) => {
      release = resolve;
    });
    const page = createPage(bridge);

    const check = page.state().check();
    const statusWhileChecking = page.state().status;
    const busyWhileChecking = page.state().busy;
    const canCheckWhileChecking = page.state().canCheck();
    release();
    await check;

    expect(statusWhileChecking).toBe(UPDATE_TEXT.checking);
    expect(busyWhileChecking).toBe(true);
    expect(canCheckWhileChecking).toBe(false);
    expect(page.state().busy).toBe(false);
  });

  it("No newer release shows up to date", async () => {
    const page = createPage(new FakeInstallationBridge());

    await page.state().check();

    expect(page.state().status).toBe("Task Tracker is up to date.");
    expect(page.state().availableVersion).toBeNull();
    expect(page.state().canDownload()).toBe(false);
  });

  it("A newer release is offered for download", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.checkResult = { outcome: "available", version: "0.2.0" };
    const page = createPage(bridge);

    await page.state().check();

    expect(page.state().status).toBe("Version 0.2.0 is available.");
    expect(page.state().availableVersion).toBe("0.2.0");
    expect(page.state().canDownload()).toBe(true);
  });

  it("A failed check shows a plain message", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.checkResult = { outcome: "failed" };
    const page = createPage(bridge);

    await page.state().check();

    expect(page.state().status).toBe(
      "Couldn't check for updates. Check your internet connection and try again.",
    );
    expect(page.state().availableVersion).toBeNull();
    expect(page.state().canCheck()).toBe(true);
  });

  it("A private or missing repository has a specific message", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.checkResult = { outcome: "feed-unavailable" };
    const page = createPage(bridge);

    await page.state().check();

    expect(page.state().status).toBe(
      "No update feed is available yet. Releases are published to a private or missing repository.",
    );
    expect(page.state().canCheck()).toBe(true);
  });

  it("An uninstalled build says updates need an installed build", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.checkResult = { outcome: "not-installed" };
    const page = createPage(bridge);

    await page.state().check();

    expect(page.state().status).toBe("Updates are available only in installed builds.");
    expect(page.state().canDownload()).toBe(false);
  });

  it("Downloading makes restart available without handing over to the updater", async () => {
    const bridge = new FakeInstallationBridge();

    const page = await readyToRestart(bridge);

    expect(bridge.downloadCount).toBe(1);
    expect(bridge.restartCount).toBe(0);
    expect(page.state().status).toBe(
      "Ready to restart. The update will be installed the next time Task Tracker starts.",
    );
    expect(page.state().canRestart()).toBe(true);
    expect(page.state().canCheck()).toBe(false);
  });

  it("Downloading shows the version until the download finishes", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.checkResult = { outcome: "available", version: "0.2.0" };
    const page = createPage(bridge);
    await page.state().check();

    const download = page.state().download();
    const statusWhileDownloading = page.state().status;
    await download;

    expect(statusWhileDownloading).toBe("Downloading version 0.2.0…");
  });

  it("A failed download says so and offers the update again", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.checkResult = { outcome: "available", version: "0.2.0" };
    bridge.downloadSucceeds = false;
    const page = createPage(bridge);
    await page.state().check();

    await page.state().download();

    expect(page.state().status).toBe(
      "Couldn't download the update. Check your internet connection and try again.",
    );
    expect(page.state().canDownload()).toBe(true);
    expect(page.state().canRestart()).toBe(false);
  });

  it("Declining to restart keeps the download ready", async () => {
    const bridge = new FakeInstallationBridge();
    const page = await readyToRestart(bridge);

    await page.state().restart(declineRestart);

    expect(bridge.downloadCount).toBe(1);
    expect(bridge.restartCount).toBe(0);
    expect(page.state().canRestart()).toBe(true);
    expect(page.state().status).toBe(UPDATE_TEXT.readyToRestart);
  });

  it("Restarting hands over to the updater and stays busy while the app closes", async () => {
    const bridge = new FakeInstallationBridge();
    const page = await readyToRestart(bridge);

    await page.state().restart(allowRestart);

    expect(bridge.restartCount).toBe(1);
    expect(page.state().status).toBe("Restarting to finish the update…");
    expect(page.state().canRestart()).toBe(false);
  });

  it("A failed restart can be retried without redownloading", async () => {
    const bridge = new FakeInstallationBridge();
    bridge.restartSucceeds = false;
    const page = await readyToRestart(bridge);

    await page.state().restart(allowRestart);

    expect(page.state().status).toBe(
      "Couldn't restart to update. The update will be installed the next time Task Tracker starts.",
    );
    expect(page.state().canRestart()).toBe(true);
    expect(page.state().canDownload()).toBe(false);
    expect(bridge.downloadCount).toBe(1);
  });

  it("A download main already verified shows as ready to restart", () => {
    const page = createPage(new FakeInstallationBridge());

    page.state().showReady();

    expect(page.state().status).toBe(UPDATE_TEXT.readyToRestart);
    expect(page.state().canRestart()).toBe(true);
  });
});
