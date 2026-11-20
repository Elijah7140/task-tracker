import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const sidebar = () => page.getByRole("navigation", { name: "Main" });

const sidebarProject = (name: string) => sidebar().getByRole("link", { name });

describe("Sidebar", () => {
  it("Holds Home and the projects, leaving app-wide pages and settings to the menu bar", async () => {
    await renderApp({ projects: [{ name: "Billing DB" }] });

    await expect.element(sidebar().getByTestId("sidebar-home")).toBeVisible();

    for (const name of ["Search", "Calendar", "Today", "Tickets", "Trash", "Settings"]) {
      expect(sidebar().getByText(name, { exact: true }).elements()).toHaveLength(0);
    }
    expect(sidebar().element().textContent).not.toContain("Task Tracker");
  });

  it("Lists projects in the server's order", async () => {
    await renderApp({ projects: [{ name: "Billing DB" }, { name: "Website" }] });

    const links = sidebar().getByTestId("sidebar-project-link");

    await expect.element(links.nth(0)).toHaveAccessibleName("Billing DB");
    await expect.element(links.nth(1)).toHaveAccessibleName("Website");
    expect(links.length).toBe(2);
  });

  it("Opens a project and marks it as the current page", async () => {
    const { history } = await renderApp({
      projects: [{ name: "Billing DB" }, { name: "Website" }],
    });

    await sidebarProject("Website").click();

    await expect.element(sidebarProject("Website")).toHaveAttribute("aria-current", "page");
    await expect.element(sidebar().getByTestId("sidebar-home")).not.toHaveAttribute("aria-current");
    expect(history.location.pathname).toMatch(/^\/projects\//);
  });

  it("Returns home from a project", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Billing DB" }] });
    history.push(`/projects/${store.summaries[0]?.project.id}`);
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();

    await sidebar().getByTestId("sidebar-home").click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    await expect
      .element(sidebar().getByTestId("sidebar-home"))
      .toHaveAttribute("aria-current", "page");
  });

  it("Creates a project from its New project button", async () => {
    const { store } = await renderApp();

    await sidebar().getByRole("button", { name: "New project" }).click();
    await userEvent.keyboard("Website{Enter}");

    await expect.element(sidebarProject("Website")).toBeVisible();
    expect(store.names()).toEqual(["Website"]);
  });

  it("Shows a project's new name after a rename on home", async () => {
    await renderApp({ projects: [{ name: "Billing DB" }] });
    await page
      .getByRole("article", { name: "Billing DB" })
      .getByTestId("project-card-menu")
      .click();
    await page.getByTestId("project-rename").click();

    await userEvent.keyboard("Accounting{Enter}");

    await expect.element(sidebarProject("Accounting")).toBeVisible();
  });
});
