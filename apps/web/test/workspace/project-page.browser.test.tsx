import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const MISSING_PROJECT_ID = "0190A1B2-0000-7000-8000-000000000999";

describe("ProjectPage", () => {
  it("Shows the project's name under a breadcrumb back to projects", async () => {
    const { history } = await renderApp({ projects: [{ name: "Billing DB" }] });
    await page.getByRole("article", { name: "Billing DB" }).click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Projects" })
      .click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });

  it("Returns home with a message when a linked project does not exist", async () => {
    const { history } = await renderApp({
      projects: [{ name: "Billing DB" }],
      path: `/projects/${MISSING_PROJECT_ID}`,
    });

    const message = page.getByRole("alertdialog", { name: "Project unavailable" });

    await expect.element(message).toHaveAccessibleDescription("Project is missing or deleted.");
    expect(history.location.pathname).toBe("/");
  });

  it("Stays home and drops the card when opening a project deleted elsewhere", async () => {
    const { store, history } = await renderApp({
      projects: [{ name: "Billing DB" }, { name: "Website" }],
    });
    await expect.element(page.getByRole("article", { name: "Billing DB" })).toBeVisible();
    store.remove(store.summaries[0]?.project.id ?? "");

    await page.getByRole("article", { name: "Billing DB" }).click();
    await page
      .getByRole("alertdialog", { name: "Project unavailable" })
      .getByRole("button", { name: "OK" })
      .click();

    await expect.element(page.getByRole("article", { name: "Billing DB" })).not.toBeInTheDocument();
    await expect.element(page.getByRole("article", { name: "Website" })).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });
});
