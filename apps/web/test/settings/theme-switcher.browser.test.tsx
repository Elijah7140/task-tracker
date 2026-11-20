import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const theme = () => document.documentElement.dataset["theme"];

describe("ThemeSwitcher in App Settings", () => {
  it("Applies and remembers the dark theme when Dark is pressed", async () => {
    await renderApp({ path: "/settings" });

    await page.getByRole("button", { name: "Dark theme" }).click();

    await expect.poll(theme).toBe("dark");
    expect(localStorage.getItem("task-tracker.theme")).toBe("dark");
    await expect.element(page.getByTestId("theme-dark")).toHaveAttribute("aria-pressed", "true");
  });

  it("Follows the system appearance when System is pressed", async () => {
    await renderApp({ path: "/settings" });
    await page.getByTestId("theme-dark").click();

    await page.getByRole("button", { name: "Match system theme" }).click();

    await expect.poll(theme).toBe("light");
  });

  it("Moves between themes with the arrow keys and selects with Enter", async () => {
    await renderApp({ path: "/settings" });
    await expect.element(page.getByTestId("theme-light")).toBeVisible();
    page.getByTestId("theme-light").element().focus();

    await userEvent.keyboard("{ArrowRight}{Enter}");

    await expect.element(page.getByTestId("theme-dark")).toHaveFocus();
    await expect.poll(theme).toBe("dark");
  });
});

describe("Theme default", () => {
  it("Starts dark on a new install with nothing stored", async () => {
    localStorage.clear();

    // A query string gives a fresh module instance, which reads storage as a new launch does.
    const freshModule = "../../src/state/theme-store.js?fresh";
    const { useThemeStore } = (await import(
      /* @vite-ignore */ freshModule
    )) as typeof import("../../src/state/theme-store.js");

    expect(useThemeStore.getState().preference).toBe("dark");
  });

  it("Has no theme control in the sidebar", async () => {
    await renderApp();

    await expect.element(page.getByTestId("sidebar")).toBeVisible();
    expect(
      page.getByTestId("sidebar").getByRole("button", { name: "Dark theme" }).elements(),
    ).toEqual([]);
  });
});
