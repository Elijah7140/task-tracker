import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  expectFocused,
  expectGone,
  openAppSettingsFromMenu,
  projectCard,
} from "../support/workflows.js";

const yellowAmount = (page: Page) => page.getByTestId("global-yellow-amount");
const saveSettings = (page: Page) => page.getByTestId("save-global-settings");

async function openAppSettings(page: Page) {
  await openAppSettingsFromMenu(page);
  await yellowAmount(page).waitFor();
}

desktopTest(
  "Saving an app threshold persists after reopening settings and after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await openAppSettings(page);

      await yellowAmount(page).fill("4");
      expect(await saveSettings(page).isEnabled()).toBe(true);
      await saveSettings(page).click();
      // The save button is also disabled while the RPC is still in flight.
      await saveSettings(page).and(page.locator(':disabled:not([aria-busy="true"])')).waitFor();
      await page.getByTestId("sidebar-home").click();
      await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor();
      await openAppSettings(page);

      expect(await yellowAmount(page).inputValue()).toBe("4");
    });

    await withDesktop(desktop, async (page) => {
      await openAppSettings(page);

      expect(await yellowAmount(page).inputValue()).toBe("4");
    });
  },
);

desktopTest("Escape cancels the new-project dialog", async ({ desktop }) => {
  await withDesktop(desktop, async (page) => {
    await page.getByTestId("new-project-button").click();
    await expectFocused(page.getByRole("textbox", { name: "Project name" }));
    await page.keyboard.type("Cancelled Project");

    await page.keyboard.press("Escape");
    await expectGone(page.getByTestId("prompt-dialog"));

    expect(await page.getByTestId("new-project-button").isEnabled()).toBe(true);
    expect(await page.getByText("Cancelled Project").count()).toBe(0);
    expect(await projectCard(page, "Cancelled Project").count()).toBe(0);
  });
});
