import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { readStoredExpanded, useSidebarStore } from "../../src/state/sidebar-store.js";
import { renderApp } from "../support/render-app.js";

const PROJECT = { name: "Billing DB", folders: [{ name: "dbo" }] };
const sidebar = () => page.getByTestId("sidebar");
const toggle = () => page.getByTestId("sidebar-toggle");

async function openCollapsedProject() {
  useSidebarStore.setState({ expanded: false });
  const app = await renderApp({ projects: [PROJECT] });
  app.history.push(`/projects/${app.store.summaries[0]?.project.id}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  return app;
}

describe("Sidebar", () => {
  it("Shows only an icon rail when collapsed, keeping each link's name", async () => {
    await openCollapsedProject();

    await expect.element(sidebar()).toHaveAttribute("data-collapsed", "true");
    await expect
      .element(page.getByRole("tree", { name: "Folders in Billing DB" }))
      .not.toBeInTheDocument();
    await expect.element(sidebar().getByRole("link", { name: "Billing DB" })).toBeVisible();
    await expect.element(sidebar().getByRole("link", { name: "Home" })).toBeVisible();
  });

  it("Expands from its toggle, remembers the choice and collapses again", async () => {
    await openCollapsedProject();

    await toggle().click();

    await expect.element(sidebar()).toHaveAttribute("data-collapsed", "false");
    await expect.element(page.getByRole("tree", { name: "Folders in Billing DB" })).toBeVisible();
    expect(localStorage.getItem("task-tracker.sidebar-expanded")).toBe("true");
    await toggle().click();
    await expect.element(sidebar()).toHaveAttribute("data-collapsed", "true");
    expect(localStorage.getItem("task-tracker.sidebar-expanded")).toBe("false");
  });

  it("Puts New project below the projects, then the toggle and Home at the bottom", async () => {
    await openCollapsedProject();
    await toggle().click();

    const project = sidebar().getByRole("link", { name: "Billing DB" }).element();
    const newProject = page.getByTestId("sidebar-new-project").element();
    const toggleButton = toggle().element();
    const home = page.getByTestId("sidebar-home").element();

    const below = (upper: Element, lower: Element) =>
      upper.getBoundingClientRect().bottom <= lower.getBoundingClientRect().top;
    expect(below(project, newProject)).toBe(true);
    expect(below(newProject, toggleButton)).toBe(true);
    expect(below(toggleButton, home)).toBe(true);
    expect(home.getBoundingClientRect().bottom).toBeGreaterThan(
      sidebar().element().getBoundingClientRect().bottom - 64,
    );
  });

  it("Starts collapsed on a new install with nothing stored", async () => {
    localStorage.clear();

    const expanded = readStoredExpanded();

    expect(expanded).toBe(false);
  });

  it("Has no decorative mark beside the menu bar", async () => {
    await renderApp();

    await expect.element(page.getByTestId("title-bar")).toBeVisible();
    expect(page.getByTestId("title-bar-brand").elements()).toEqual([]);
  });
});
