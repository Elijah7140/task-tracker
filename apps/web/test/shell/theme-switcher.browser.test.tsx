import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const theme = () => document.documentElement.dataset["theme"];

describe("ThemeSwitcher", () => {
  it("Applies and remembers the dark theme when Dark is pressed", async () => {
    await renderApp();

    await page.getByRole("button", { name: "Dark theme" }).click();

    await expect.poll(theme).toBe("dark");
    expect(localStorage.getItem("task-tracker.theme")).toBe("dark");
    await expect.element(page.getByTestId("theme-dark")).toHaveAttribute("aria-pressed", "true");
  });

  it("Follows the system appearance when System is pressed", async () => {
    await renderApp();
    await page.getByTestId("theme-dark").click();

    await page.getByRole("button", { name: "Match system theme" }).click();

    await expect.poll(theme).toBe("light");
  });

  it("Moves between themes with the arrow keys and selects with Enter", async () => {
    await renderApp();
    page.getByTestId("theme-light").element().focus();

    await userEvent.keyboard("{ArrowRight}{Enter}");

    await expect.element(page.getByTestId("theme-dark")).toHaveFocus();
    await expect.poll(theme).toBe("dark");
  });
});
