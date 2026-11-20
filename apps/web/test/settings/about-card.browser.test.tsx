import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { UPDATE_TEXT } from "../../src/state/app-update-store.js";
import { FakeDesktopInstallation } from "../support/fake-desktop-installation.js";
import { renderApp } from "../support/render-app.js";
import { chooseMenuCommand } from "../support/menu-bar.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const aboutCard = () => page.getByTestId("about-card");
const aboutVersion = () => page.getByTestId("about-version");
const checkButton = () => page.getByRole("button", { name: "Check for updates" });
const downloadButton = () => page.getByRole("button", { name: "Download", exact: true });
const restartButton = () => page.getByRole("button", { name: "Restart to update" });
const updateStatus = () => page.getByTestId("update-status");
const discardDialog = () => page.getByRole("alertdialog", { name: "Discard unsaved settings?" });

async function openAppSettings() {
  const app = await renderApp();
  await chooseMenuCommand("file", "menu-app-settings");
  await expect.element(page.getByRole("heading", { level: 1, name: "App Settings" })).toBeVisible();
  return app;
}

function offerUpdate() {
  const desktop = new FakeDesktopInstallation().install();
  desktop.checkResult = { outcome: "available", version: "0.2.0" };
  return desktop;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AboutCard", () => {
  it("Shows the app version from the desktop shell", async () => {
    new FakeDesktopInstallation().install();

    await openAppSettings();

    await expect.element(aboutVersion()).toHaveTextContent("Task Tracker version 0.1.0");
    await expect.element(downloadButton()).not.toBeInTheDocument();
    await expect.element(restartButton()).not.toBeInTheDocument();
  });

  it("Has no About card outside the desktop app", async () => {
    await openAppSettings();

    await expect.element(page.getByTestId("global-defaults-card")).toBeVisible();
    await expect.element(aboutCard()).not.toBeInTheDocument();
  });

  it("Pressing Enter on Check for updates offers a newer release", async () => {
    const desktop = offerUpdate();
    await openAppSettings();

    checkButton().element().focus();
    await userEvent.keyboard("{Enter}");

    await expect.element(downloadButton()).toBeVisible();
    await expect.element(updateStatus()).toHaveTextContent("Version 0.2.0 is available.");
    expect(desktop.checkCount).toBe(1);
  });

  it("Clicking Check for updates in an uninstalled build explains why there are none", async () => {
    const desktop = new FakeDesktopInstallation().install();
    desktop.checkResult = { outcome: "not-installed" };
    await openAppSettings();

    await checkButton().click();

    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.notInstalled);
    await expect.element(downloadButton()).not.toBeInTheDocument();
  });

  it("Shows a missing feed and a failed check with different messages", async () => {
    const desktop = new FakeDesktopInstallation().install();
    desktop.checkResult = { outcome: "feed-unavailable" };
    await openAppSettings();

    await checkButton().click();
    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.feedUnavailable);
    desktop.checkResult = { outcome: "failed" };
    await checkButton().click();

    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.checkFailed);
    await expect.element(checkButton()).toBeEnabled();
  });

  it("A failed download says so and offers the download again", async () => {
    const desktop = offerUpdate();
    desktop.downloadSucceeds = false;
    await openAppSettings();
    await checkButton().click();

    await downloadButton().click();

    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.downloadFailed);
    await expect.element(downloadButton()).toBeEnabled();
    await expect.element(restartButton()).not.toBeInTheDocument();
  });

  it("Restart prompts for edits made while the update downloaded", async () => {
    const desktop = offerUpdate();
    desktop.holdDownload();
    await openAppSettings();
    await checkButton().click();
    await downloadButton().click();
    await expect.element(updateStatus()).toHaveTextContent("Downloading version 0.2.0…");
    await page.getByTestId("global-auto-complete").click();
    await expect.element(page.getByTestId("save-global-settings")).toBeEnabled();
    await expect.element(discardDialog()).not.toBeInTheDocument();

    desktop.releaseDownload();
    await expect.element(restartButton()).toBeVisible();
    expect(desktop.restartCount).toBe(0);
    await restartButton().click();
    await expect.element(discardDialog()).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(discardDialog()).not.toBeInTheDocument();
    await expect.element(page.getByTestId("save-global-settings")).toBeEnabled();
    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.readyToRestart);
    expect(desktop.restartCount).toBe(0);
    await restartButton().click();
    await expect.element(discardDialog()).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.restarting);
    expect(desktop.restartCount).toBe(1);
    expect(desktop.downloadCount).toBe(1);
  });

  it("An update can be restarted after returning to settings", async () => {
    const desktop = offerUpdate();
    desktop.holdDownload();
    await openAppSettings();
    await checkButton().click();
    await downloadButton().click();
    await page.getByTestId("app-settings-back").click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();

    desktop.releaseDownload();
    await chooseMenuCommand("file", "menu-app-settings");
    await restartButton().click();

    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.restarting);
    await expect.element(discardDialog()).not.toBeInTheDocument();
    expect(desktop.restartCount).toBe(1);
  });

  it("A failed restart can be retried without downloading again", async () => {
    const desktop = offerUpdate();
    desktop.restartSucceeds = false;
    await openAppSettings();
    await checkButton().click();
    await downloadButton().click();

    await restartButton().click();

    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.restartFailed);
    await expect.element(restartButton()).toBeEnabled();
    await expect.element(checkButton()).toBeDisabled();
    expect(desktop.downloadCount).toBe(1);
  });

  it("Offers Restart to update for a download main already verified", async () => {
    const desktop = new FakeDesktopInstallation().install();
    desktop.installation = { ...desktop.installation, readyVersion: "0.2.0" };

    await openAppSettings();

    await expect.element(restartButton()).toBeVisible();
    await expect.element(updateStatus()).toHaveTextContent(UPDATE_TEXT.readyToRestart);
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed restart-to-update baseline", async () => {
      offerUpdate();
      await openAppSettings();
      await checkButton().click();
      await downloadButton().click();
      await expect.element(restartButton()).toBeVisible();

      await settleTheme(theme);

      await expect.element(aboutCard()).toMatchScreenshot(`about-card-ready-${theme}`);
    });
  });
});
