import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { BILLING_PROJECT } from "../support/workspace-seed.js";

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

  it("Shows the project root's items and folders after opening a project", async () => {
    await renderApp({ projects: [BILLING_PROJECT] });

    await page.getByRole("article", { name: "Billing DB" }).click();

    await expect.element(page.getByRole("tree", { name: "Items in Billing DB" })).toBeVisible();
    await expect.element(page.getByRole("tree", { name: "Folders in Billing DB" })).toBeVisible();
  });

  it("Falls back to the project root for a folder that no longer exists", async () => {
    const { store, history } = await renderApp({ projects: [BILLING_PROJECT] });
    const projectId = store.summaries[0]?.project.id ?? "";
    const reporting = store.folderNamed("Reporting").id;
    store.removeFolder(reporting);

    history.push(`/projects/${projectId}/folders/${reporting}`);

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Accepts folder links with lowercase IDs", async () => {
    const { store, history } = await renderApp({ projects: [BILLING_PROJECT] });
    const projectId = store.summaries[0]?.project.id ?? "";

    history.push(
      `/projects/${projectId.toLowerCase()}/folders/${store.folderNamed("dbo").id.toLowerCase()}`,
    );

    await expect.element(page.getByRole("heading", { level: 1, name: "dbo" })).toBeVisible();
    await expect
      .element(page.getByRole("treeitem", { name: "dbo", exact: true }))
      .toHaveAttribute("aria-current", "page");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed workspace baseline", async () => {
      const { store, history } = await renderApp({
        projects: [BILLING_PROJECT, { name: "Website" }],
      });
      const projectId = store.summaries[0]?.project.id ?? "";
      history.push(`/projects/${projectId}/folders/${store.folderNamed("Tables").id}`);
      const items = page.getByRole("tree", { name: "Items in Tables" });
      await items
        .getByRole("treeitem", { name: "Add index to Invoice.CustomerId" })
        .getByTestId("item-toggle")
        .first()
        .click();
      await items
        .getByRole("treeitem", { name: "Completed (2)" })
        .getByTestId("completed-section-toggle")
        .first()
        .click();
      await expect
        .element(items.getByRole("treeitem", { name: "Archive 2024 invoices" }))
        .toBeVisible();
      await userEvent.click(
        items
          .getByRole("treeitem", { name: "Tidy column comments" })
          .getByTestId("item-row")
          .first(),
      );
      (document.activeElement as HTMLElement | null)?.blur();

      await settleTheme(theme);

      await expect.element(page.getByTestId("app-shell")).toMatchScreenshot(`workspace-${theme}`);
    });

    it("Matches the reviewed empty folder baseline", async () => {
      const { store, history } = await renderApp({ projects: [BILLING_PROJECT] });
      const projectId = store.summaries[0]?.project.id ?? "";
      history.push(`/projects/${projectId}/folders/${store.folderNamed("Views").id}`);
      await expect.element(page.getByTestId("empty-area")).toBeVisible();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`workspace-empty-${theme}`);
    });
  });
});
