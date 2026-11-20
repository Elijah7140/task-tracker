import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

describe("createAppRouter", () => {
  it("Shows a not-found page with a way back for an unknown address", async () => {
    const { history } = await renderApp({ path: "/nowhere" });
    await expect
      .element(page.getByRole("heading", { level: 1, name: "Page not found" }))
      .toBeVisible();

    await page.getByRole("link", { name: "Go to projects" }).click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });
});
