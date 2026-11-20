import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { chooseMenuCommand, menuPopup, openMenu } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const projects = [{ name: "Billing DB", items: [{ title: "Report" }] }];

const ENTRIES = [
  { testId: "menu-search", name: "Search", label: "Ctrl+F", keys: "Control+F" },
  { testId: "menu-calendar", name: "Calendar", label: "Ctrl+Shift+C", keys: "Control+Shift+C" },
  { testId: "menu-today", name: "Today", label: "Ctrl+Shift+D", keys: "Control+Shift+D" },
  { testId: "menu-tickets", name: "Tickets", label: "Ctrl+Shift+K", keys: "Control+Shift+K" },
  { testId: "menu-trash", name: "Trash", label: "Ctrl+Shift+T", keys: "Control+Shift+T" },
  { testId: "menu-reminders", name: "Reminders", label: "Ctrl+Shift+R", keys: "Control+Shift+R" },
] as const;

const PAGES = [
  { testId: "menu-search", shown: () => page.getByRole("heading", { level: 1, name: "Search" }) },
  { testId: "menu-calendar", shown: () => page.getByTestId("calendar-page") },
  { testId: "menu-today", shown: () => page.getByTestId("today-page") },
  { testId: "menu-tickets", shown: () => page.getByRole("heading", { level: 1, name: "Tickets" }) },
  { testId: "menu-trash", shown: () => page.getByRole("heading", { name: "Trash", exact: true }) },
] as const;

const workspaceHeading = () => page.getByRole("heading", { level: 1, name: "Billing DB" });

async function openWorkspace() {
  const app = await renderApp({ projects });
  await page.getByRole("article", { name: "Billing DB" }).click();
  await expect.element(workspaceHeading()).toBeVisible();
  return app;
}

describe("ViewMenu", () => {
  it("Lists the pages in the legacy order with their shortcuts", async () => {
    await renderApp({ projects });

    await openMenu("view");

    const items = menuPopup("view").getByRole("menuitem");
    for (const [index, entry] of ENTRIES.entries()) {
      await expect.element(items.nth(index)).toHaveAccessibleName(entry.name);
      await expect.element(items.nth(index)).toHaveAttribute("data-testid", entry.testId);
      await expect.element(items.nth(index)).toHaveAttribute("aria-keyshortcuts", entry.keys);
      await expect.element(items.nth(index).getByText(entry.label)).toBeVisible();
    }
    expect(items.length).toBe(ENTRIES.length);
  });

  it.each(PAGES)("Opens $testId over the workspace, and Back returns there", async (entry) => {
    const { history } = await openWorkspace();
    const workspace = history.location.pathname;

    await chooseMenuCommand("view", entry.testId);
    await expect.element(entry.shown()).toBeVisible();
    await expect.element(workspaceHeading()).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await expect.element(workspaceHeading()).toBeVisible();
    expect(history.location.pathname).toBe(workspace);
  });

  it("Switches between covering pages and keeps the first return page", async () => {
    const { history } = await openWorkspace();
    const workspace = history.location.pathname;

    await chooseMenuCommand("view", "menu-calendar");
    await chooseMenuCommand("view", "menu-trash");
    await chooseMenuCommand("view", "menu-search");
    await expect.element(PAGES[0].shown()).toBeVisible();
    await page.getByTestId("search-back").click();

    await expect.element(workspaceHeading()).toBeVisible();
    expect(history.location.pathname).toBe(workspace);
  });

  it("Scopes Search opened from a workspace to that project", async () => {
    await openWorkspace();

    await chooseMenuCommand("view", "menu-search");

    await expect.element(page.getByTestId("search-scope")).toHaveTextContent("This project");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed baseline of the workspace with the View menu open", async () => {
      await openWorkspace();
      await settleTheme(theme);

      await openMenu("view");
      await expect.element(menuPopup("view").getByTestId("menu-reminders")).toBeVisible();

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`workspace-view-menu-${theme}`);
    });
  });
});
