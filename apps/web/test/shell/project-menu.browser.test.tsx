import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { chooseMenuCommand, menuPopup, menuTrigger, openMenu } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const projects = [{ name: "Billing DB", items: [{ title: "Report" }] }, { name: "Website" }];

const item = (name: string) => menuPopup("project").getByRole("menuitem", { name });
const heading = (name: string) => page.getByRole("heading", { level: 1, name });

async function openWorkspace() {
  const app = await renderApp({ projects });
  await page.getByRole("article", { name: "Billing DB" }).click();
  await expect.element(heading("Billing DB")).toBeVisible();
  return app;
}

describe("ProjectMenu", () => {
  it("Lists New project and project import and export on Home", async () => {
    await renderApp({ projects });

    await openMenu("project");

    await expect.element(item("New project…")).toHaveAttribute("data-testid", "menu-new-project");
    await expect
      .element(item("Import CSV into project…"))
      .toHaveAttribute("data-testid", "transfer-import-csv");
    await expect
      .element(item("Export project (JSON)…"))
      .toHaveAttribute("data-testid", "transfer-export-project");
    await expect
      .element(item("Export project (CSV)…"))
      .toHaveAttribute("data-testid", "transfer-export-project-csv");
    expect(menuPopup("project").getByRole("menuitem").length).toBe(4);
  });

  it("Creates a project from New project", async () => {
    const { store } = await renderApp({ projects });

    await chooseMenuCommand("project", "menu-new-project");
    const name = page.getByRole("textbox", { name: "Project name" });
    await expect.element(name).toHaveFocus();
    await userEvent.keyboard("Accounting{Enter}");

    await expect.element(page.getByRole("article", { name: "Accounting" })).toBeVisible();
    expect(store.names()).toContain("Accounting");
  });

  it("Cancels New project with Escape and leaves the menu usable", async () => {
    const { store } = await renderApp({ projects });
    await chooseMenuCommand("project", "menu-new-project");
    await expect.element(page.getByRole("textbox", { name: "Project name" })).toHaveFocus();
    await userEvent.keyboard("Cancelled Project");

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByTestId("prompt-dialog")).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    await expect.element(menuTrigger("project")).not.toHaveAttribute("data-disabled");
    expect(store.names()).not.toContain("Cancelled Project");
  });

  it("Opens Project Settings for the open project in a workspace", async () => {
    const { store, history } = await openWorkspace();
    const projectId = store.summaries[0]!.project.id;

    await openMenu("project");
    expect(menuPopup("project").getByRole("menuitem").length).toBe(1);
    await item("Project settings…").click();

    await expect.element(heading("Project Settings")).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}/settings`);
    await page.getByTestId("project-settings-back").click();
    await expect.element(heading("Billing DB")).toBeVisible();
  });

  it("Is disabled on settings pages and covering pages", async () => {
    const { store, history } = await openWorkspace();
    const projectId = store.summaries[0]!.project.id;

    await userEvent.keyboard("{Control>}{Shift>}c{/Shift}{/Control}");
    await expect.element(page.getByTestId("calendar-page")).toBeVisible();
    await expect.element(menuTrigger("project")).toHaveAttribute("data-disabled");
    await userEvent.keyboard("{Escape}");
    await expect.element(menuTrigger("project")).not.toHaveAttribute("data-disabled");
    history.push(`/projects/${projectId}/settings`);
    await expect.element(heading("Project Settings")).toBeVisible();
    await expect.element(menuTrigger("project")).toHaveAttribute("data-disabled");
    await chooseMenuCommand("file", "menu-app-settings");
    await expect.element(heading("App Settings")).toBeVisible();

    await expect.element(menuTrigger("project")).toHaveAttribute("data-disabled");
    await userEvent.keyboard("{Alt>}p{/Alt}");
    await expect.element(menuPopup("project")).not.toBeInTheDocument();
  });

  it("Skips the disabled Project menu with the arrow keys and Alt+P", async () => {
    await renderApp({ projects });
    await chooseMenuCommand("file", "menu-app-settings");
    await expect.element(heading("App Settings")).toBeVisible();
    await expect.poll(() => document.activeElement?.tagName).toBe("MAIN");
    await userEvent.keyboard("{F10}{ArrowRight}");
    await expect.element(menuTrigger("edit")).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");

    await expect.element(menuTrigger("view")).toHaveFocus();
    await expect.element(menuTrigger("project")).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Alt>}p{/Alt}");
    await expect.element(menuPopup("project")).not.toBeInTheDocument();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed baseline of Home with the Project menu open", async () => {
      await renderApp({ projects });
      await expect.element(page.getByRole("article", { name: "Website" })).toBeVisible();
      await settleTheme(theme);

      await openMenu("project");
      await expect.element(item("Export project (CSV)…")).toBeVisible();

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`home-project-menu-${theme}`);
    });
  });
});
