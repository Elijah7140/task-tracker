import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import { openAppSettingsFromMenu } from "../support/workflows.js";
import { fakeAppImageInstall } from "../support/installed-app.js";

const startWithSystem = (page: Page) =>
  page.getByRole("checkbox", { name: "Start Task Tracker when I sign in" });
const saveSettings = (page: Page) => page.getByTestId("save-global-settings");

async function openAppSettings(page: Page) {
  await openAppSettingsFromMenu(page);
  await page.getByTestId("about-card").waitFor();
}

async function toggleAndSave(page: Page) {
  await startWithSystem(page).click();
  await saveSettings(page).click();
  // The save button is also disabled while the RPC is still in flight.
  await saveSettings(page).and(page.locator(':disabled:not([aria-busy="true"])')).waitFor();
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

// The Windows Run key needs an installed build; verify it by hand on Windows (§7.13).
desktopTest.runIf(process.platform === "linux")(
  "Start with system writes and removes the per-user autostart file for the AppImage",
  async ({ desktop }) => {
    const install = await fakeAppImageInstall(desktop);
    const autostart = join(install.home, ".config", "autostart", "task-tracker.desktop");

    await withDesktop(
      desktop,
      async (page) => {
        await openAppSettings(page);
        expect(await startWithSystem(page).isChecked()).toBe(false);

        await toggleAndSave(page);

        await expect.poll(() => exists(autostart)).toBe(true);
        const text = await readFile(autostart, "utf8");
        expect(text).toContain(`Exec="${install.appImage}"\n`);
        expect(await page.getByTestId("global-settings-error").count()).toBe(0);
      },
      install.environment,
    );

    await withDesktop(
      desktop,
      async (page) => {
        await openAppSettings(page);
        expect(await startWithSystem(page).isChecked()).toBe(true);

        await toggleAndSave(page);

        await expect.poll(() => exists(autostart)).toBe(false);
      },
      install.environment,
    );
  },
);

desktopTest("An unpacked build does not offer start with system", async ({ desktop }) => {
  await withDesktop(desktop, async (page) => {
    await openAppSettings(page);

    expect(await page.getByTestId("about-version").textContent()).toBe(
      "Task Tracker version 0.1.0",
    );
    expect(await startWithSystem(page).count()).toBe(0);
  });
});
