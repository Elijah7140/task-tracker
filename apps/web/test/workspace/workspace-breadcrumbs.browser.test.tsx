import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { BILLING_PROJECT } from "../support/workspace-seed.js";

const breadcrumb = () => page.getByRole("navigation", { name: "Breadcrumb" });

async function openTables() {
  const app = await renderApp({ projects: [BILLING_PROJECT] });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}/folders/${app.store.folderNamed("Tables").id}`);
  await expect.element(page.getByRole("heading", { level: 1, name: "Tables" })).toBeVisible();
  return { ...app, projectId };
}

describe("WorkspaceBreadcrumbs", () => {
  it("Shows the path from Projects to the open folder with the folder as the current page", async () => {
    await openTables();

    const segments = breadcrumb().getByRole("listitem");

    await expect.element(segments.nth(0)).toHaveTextContent("Projects");
    await expect.element(segments.nth(1)).toHaveTextContent("Billing DB");
    await expect.element(segments.nth(2)).toHaveTextContent("dbo");
    await expect.element(breadcrumb().getByText("Tables")).toHaveAttribute("aria-current", "page");
    expect(segments.length).toBe(4);
  });

  it("Opens a parent folder's area from its segment", async () => {
    const { history, store } = await openTables();

    await breadcrumb().getByRole("link", { name: "dbo" }).click();

    await expect.element(page.getByRole("heading", { level: 1, name: "dbo" })).toBeVisible();
    expect(history.location.pathname).toMatch(
      new RegExp(`/folders/${store.folderNamed("dbo").id}$`),
    );
  });

  it("Opens the project root from the project segment", async () => {
    const { history, projectId } = await openTables();

    await breadcrumb().getByRole("link", { name: "Billing DB" }).click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });
});
