import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { useSidebarStore } from "../../src/state/sidebar-store.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

/** Reviewed baselines for the §7.19 screens: add dialogs, drill-in and the collapsed sidebar. */

const PROJECT = {
  name: "ClockTower",
  items: [
    {
      title: "Training rollout",
      notes: "Move employee training onto the new qualifications model.",
      children: [
        { title: "Conversion script", children: [{ title: "Map qualifications" }] },
        { title: "Manual sheet import", priority: "High" as const },
      ],
    },
    {
      title: "Employee training conversion data is not correct",
      kind: "Ticket" as const,
      ticketNumber: "385405",
      description: "Going to use a manual sheet import.",
    },
  ],
};

async function openProject() {
  const app = await renderApp({
    projects: [PROJECT],
    configure: (store) => {
      const app = store.ticketFields.seed("Application", "ClockTower");
      const module = store.ticketFields.seed("Module", "Train", app.id);
      store.ticketFields.seed("Interface", "Conversion", module.id);
      store.ticketFields.seed("Person", "Harris, Elijah");
    },
  });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  return app;
}

const shell = () => page.getByTestId("app-shell");

describe.each(THEMES)("in the %s theme", (theme) => {
  it("Matches the quick and detailed Add Ticket baselines", async () => {
    await openProject();
    await page.getByTestId("workspace-add-ticket").click();
    await expect.element(page.getByTestId("add-ticket-number")).toHaveFocus();
    await userEvent.keyboard("385500");

    await settleTheme(theme);
    await expect
      .element(page.getByTestId("add-item-dialog"))
      .toMatchScreenshot(`add-ticket-quick-${theme}`);
    await page.getByTestId("add-item-expand").click();
    await expect
      .element(page.getByTestId("add-item-content"))
      .toHaveAttribute("data-detailed", "true");
    await settleTheme(theme);
    await expect
      .element(page.getByTestId("add-item-dialog"))
      .toMatchScreenshot(`add-ticket-detailed-${theme}`);
  });

  it("Matches the quick Add ToDo baseline", async () => {
    await openProject();
    await page.getByTestId("workspace-add-todo").click();
    await expect.element(page.getByTestId("add-title")).toHaveFocus();

    await settleTheme(theme);
    await expect
      .element(page.getByTestId("add-item-dialog"))
      .toMatchScreenshot(`add-todo-quick-${theme}`);
  });

  it("Matches the drilled-in item baseline", async () => {
    await openProject();
    await page
      .getByRole("treeitem", { name: "Training rollout", exact: true })
      .getByTestId("item-card-header")
      .first()
      .dblClick();
    await expect.element(page.getByTestId("item-details-panel")).toBeVisible();

    await settleTheme(theme);
    await expect.element(shell()).toMatchScreenshot(`drill-in-${theme}`);
  });

  it("Matches the collapsed sidebar baseline", async () => {
    await openProject();
    useSidebarStore.setState({ expanded: false });
    await expect.element(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");

    await settleTheme(theme);
    await expect.element(shell()).toMatchScreenshot(`workspace-collapsed-sidebar-${theme}`);
  });
});
