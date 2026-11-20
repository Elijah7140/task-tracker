import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const PROJECT = {
  name: "ClockTower",
  items: [
    {
      title: "Training rollout",
      children: [
        { title: "Conversion script", children: [{ title: "Map qualifications" }] },
        { title: "Manual sheet import" },
      ],
    },
    { title: "Employee training data", kind: "Ticket" as const, ticketNumber: "385405" },
  ],
};

const card = (title: string) =>
  page.getByRole("treeitem", { name: title, exact: true }).getByTestId("item-row").first();
const panel = () => page.getByTestId("item-details-panel");
const drilled = () => page.getByTestId("drilled-in-item");
const breadcrumb = () => page.getByRole("navigation", { name: "Breadcrumb" });

async function openProject() {
  const app = await renderApp({ projects: [PROJECT] });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  const itemId = (title: string, parent = false) =>
    app.store.findItemByTitle(projectId, null, title)?.item[parent ? "parentItemId" : "id"] ?? "";
  return { ...app, projectId, itemId };
}

describe("Drill-in", () => {
  it("Opens a double-clicked card with its children as cards and its details beside them", async () => {
    const { history, projectId, itemId } = await openProject();

    await card("Training rollout").dblClick();

    await expect.element(drilled()).toBeVisible();
    expect(history.location.pathname).toBe(
      `/projects/${projectId}/items/${itemId("Training rollout")}`,
    );
    await expect.element(panel().getByRole("heading", { name: "Training rollout" })).toBeVisible();
    await expect
      .element(drilled().getByRole("treeitem", { name: "Conversion script", exact: true }))
      .toHaveAttribute("data-item-card-item", "true");
    await expect.element(breadcrumb().getByRole("link", { name: "ClockTower" })).toBeVisible();
    await expect.element(breadcrumb().getByText("Training rollout")).toBeVisible();
  });

  it("Goes one level deeper from a child card and links back through the breadcrumbs", async () => {
    const { history, projectId, itemId } = await openProject();
    await card("Training rollout").dblClick();
    await expect.element(drilled()).toBeVisible();

    await card("Conversion script").dblClick();

    await expect.element(panel().getByRole("heading", { name: "Conversion script" })).toBeVisible();
    await expect
      .element(drilled().getByRole("treeitem", { name: "Map qualifications", exact: true }))
      .toBeVisible();
    await breadcrumb().getByRole("link", { name: "Training rollout" }).click();
    await expect.element(panel().getByRole("heading", { name: "Training rollout" })).toBeVisible();
    expect(history.location.pathname).toBe(
      `/projects/${projectId}/items/${itemId("Training rollout")}`,
    );
  });

  it("Shows a ticket's fields and logs a new comment in its panel", async () => {
    await openProject();
    await card("Employee training data").dblClick();
    await expect.element(panel().getByTestId("details-kind")).toHaveTextContent("Ticket #385405");
    await expect.element(panel().getByTestId("details-comments")).toBeVisible();

    await panel().getByTestId("ticket-comment-input").fill("Pending Wayne's discussion.");
    await panel().getByTestId("ticket-comment-add").click();

    await expect
      .element(panel().getByTestId("ticket-comment").getByText("Pending Wayne's discussion."))
      .toBeVisible();
    await expect.element(panel().getByTestId("ticket-comment-input")).toHaveValue("");
  });

  it("Returns to the area for an item that is not in it", async () => {
    const { history, projectId } = await openProject();

    history.push(`/projects/${projectId}/items/0190A1B2-0000-7000-8000-000000000999`);

    await expect.poll(() => history.location.pathname).toBe(`/projects/${projectId}`);
    await expect.element(drilled()).not.toBeInTheDocument();
  });

  it("Quick-adds a child of the drilled-in item", async () => {
    const { itemId } = await openProject();
    await card("Training rollout").dblClick();
    await expect.element(drilled()).toBeVisible();

    await drilled().getByTestId("quick-add-input").click();
    await userEvent.keyboard("Schedule the import{Enter}");

    await expect
      .element(drilled().getByRole("treeitem", { name: "Schedule the import", exact: true }))
      .toBeVisible();
    expect(itemId("Schedule the import", true)).toBe(itemId("Training rollout"));
  });
});
