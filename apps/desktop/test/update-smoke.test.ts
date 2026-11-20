import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import { expect } from "vitest";
import {
  type DesktopFixture,
  desktopEnvironment,
  desktopTest,
  executable,
  firstWindow,
  launch,
  withDesktop,
} from "./support/desktop-app.js";
import { openAppSettingsFromMenu } from "./support/workflows.js";
import { releaseMetadata, startFakeUpdateFeed } from "./support/fake-update-feed.js";
import {
  type FakeAppImageInstall,
  fakeAppImageInstall,
  recordedStart,
  recordingAppImage,
} from "./support/installed-app.js";

const APPIMAGE = "task-tracker-0.2.0-linux-x64.AppImage";

const updateStatus = (page: Page) => page.getByTestId("update-status");

const relaunchMarker = (install: FakeAppImageInstall) => join(install.folder, "relaunched.txt");

/** A stand-in update: a script that records how the relaunch started it. */
function updatePayload(install: FakeAppImageInstall) {
  return recordingAppImage(relaunchMarker(install));
}

async function startUpdateFeed(install: FakeAppImageInstall) {
  const feed = await startFakeUpdateFeed();
  const payload = updatePayload(install);
  feed.serve("latest-linux.yml", { body: releaseMetadata("0.2.0", APPIMAGE, payload) });
  feed.serve(APPIMAGE, { body: payload });
  return { feed, payload };
}

/** Checks for updates and downloads the offered release in App Settings. */
async function downloadUpdate(page: Page) {
  await openAppSettingsFromMenu(page);
  await page.getByTestId("about-card").waitFor();
  await page.getByRole("button", { name: "Check for updates" }).click();
  await page.getByText("Version 0.2.0 is available.").waitFor();
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("button", { name: "Restart to update" }).waitFor();
}

const relaunched = (install: FakeAppImageInstall) =>
  stat(relaunchMarker(install)).then(
    () => true,
    () => false,
  );

/**
 * Waits for the relaunch and checks it started the new AppImage the way a fresh
 * launch would: able to gain privileges for FUSE and without the old mount's `APPDIR`.
 */
async function expectFreshRelaunch(install: FakeAppImageInstall) {
  await expect.poll(() => relaunched(install)).toBe(true);
  expect(await recordedStart(relaunchMarker(install))).toEqual(["NoNewPrivs:\t0", "APPDIR=unset"]);
}

function feedEnvironment(install: FakeAppImageInstall, feedUrl: string) {
  return { ...install.environment, TASKTRACKER_UPDATE_FEED_URL: feedUrl };
}

/** Starts the packaged app outside Playwright and waits for it to exit on its own. */
async function launchUntilExit(desktop: DesktopFixture, environment: NodeJS.ProcessEnv) {
  const child = spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: desktopEnvironment(desktop, environment),
    stdio: "ignore",
  });
  try {
    return await once(child, "exit");
  } finally {
    if (child.exitCode === null) {
      child.kill();
    }
  }
}

// Updates replace an AppImage here. Verify an installed Windows update by hand (§7.13).
desktopTest.runIf(process.platform === "linux")(
  "A verified update from the feed is ready to restart and Restart installs it",
  async ({ desktop }) => {
    const install = await fakeAppImageInstall(desktop);
    const { feed, payload } = await startUpdateFeed(install);
    const application = await launch(desktop, feedEnvironment(install, feed.url));
    try {
      const page = await firstWindow(application);
      await downloadUpdate(page);
      expect(await updateStatus(page).textContent()).toBe(
        "Ready to restart. The update will be installed the next time Task Tracker starts.",
      );
      expect(await readFile(install.appImage, "utf8")).toBe("old AppImage");
      expect(feed.requests.map(({ path }) => path)).toEqual([
        "/feed/latest-linux.yml",
        `/feed/${APPIMAGE}`,
      ]);

      const exited = once(application.process(), "exit");
      await page.getByRole("button", { name: "Restart to update" }).click();
      await exited;

      expect(await readFile(install.appImage, "utf8")).toBe(payload);
      await expectFreshRelaunch(install);
    } finally {
      await application.close().catch(() => {});
      await feed.close();
    }
  },
);

desktopTest.runIf(process.platform === "linux")(
  "A declined restart installs the downloaded update at the next launch",
  async ({ desktop }) => {
    const install = await fakeAppImageInstall(desktop);
    const { feed, payload } = await startUpdateFeed(install);
    const environment = feedEnvironment(install, feed.url);
    try {
      await withDesktop(desktop, downloadUpdate, environment);
      expect(await readFile(install.appImage, "utf8")).toBe("old AppImage");

      expect(await launchUntilExit(desktop, environment)).toEqual([0, null]);

      expect(await readFile(install.appImage, "utf8")).toBe(payload);
      await expectFreshRelaunch(install);
    } finally {
      await feed.close();
    }
  },
);

desktopTest.runIf(process.platform === "linux")(
  "A download that fails verification is never offered for restart",
  async ({ desktop }) => {
    const install = await fakeAppImageInstall(desktop);
    const { feed } = await startUpdateFeed(install);
    feed.serve(APPIMAGE, { body: "#!/bin/sh\necho tampered\n" });
    try {
      await withDesktop(
        desktop,
        async (page) => {
          await openAppSettingsFromMenu(page);
          await page.getByRole("button", { name: "Check for updates" }).click();
          await page.getByRole("button", { name: "Download", exact: true }).click();

          await page
            .getByText(
              "Couldn't download the update. Check your internet connection and try again.",
            )
            .waitFor();
          expect(await page.getByRole("button", { name: "Restart to update" }).count()).toBe(0);
        },
        feedEnvironment(install, feed.url),
      );

      await withDesktop(
        desktop,
        (page) => page.getByTestId("menu-file").waitFor(),
        feedEnvironment(install, feed.url),
      );

      expect(await readFile(install.appImage, "utf8")).toBe("old AppImage");
      expect(await relaunched(install)).toBe(false);
    } finally {
      await feed.close();
    }
  },
);
