import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { NO_TICKET_FIELDS } from "../support/fake-ticket-fields.js";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
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
    { title: "Payroll export", kind: "Ticket" as const, ticketNumber: "385400" },
    { title: "Legacy numbered ToDo", ticketNumber: "OLD-7" },
  ],
};

const card = (title: string) =>
  page.getByRole("treeitem", { name: title, exact: true }).getByTestId("item-card-header").first();
const panel = () => page.getByTestId("item-details-panel");
const drilled = () => page.getByTestId("drilled-in-item");
const breadcrumb = () => page.getByRole("navigation", { name: "Breadcrumb" });

/** Gives a ticket a typed parent ticket number, as an editor save would have stored. */
function parentTicket(title: string, parentTicketNumber: string) {
  return (store: FakeProjectStore) => {
    const projectId = store.summaries[0]?.project.id ?? "";
    const itemId = store.findItemByTitle(projectId, null, title)?.item.id ?? "";
    store.ticketFields.details.set(itemId, { ...NO_TICKET_FIELDS, parentTicketNumber });
  };
}

async function openProject(configure?: (store: FakeProjectStore) => void) {
  const app = await renderApp({ projects: [PROJECT], ...(configure ? { configure } : {}) });
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

  it("Shows a ticket's fields without comments, which were removed", async () => {
    await openProject();

    await card("Employee training data").dblClick();

    await expect.element(panel().getByTestId("details-kind")).toHaveTextContent("Ticket #385405");
    await expect.element(panel().getByTestId("details-comments")).not.toBeInTheDocument();
    await expect.element(panel().getByTestId("ticket-comment-input")).not.toBeInTheDocument();
  });

  it("Opens the parent ticket from the paperclip beside its number", async () => {
    const { history, projectId, itemId, store } = await openProject(
      parentTicket("Employee training data", "385400"),
    );
    await card("Employee training data").dblClick();
    const row = panel().getByTestId("details-parent-ticket");
    await expect.element(row).toHaveTextContent("Parent ticket#385400");

    await row.getByRole("button", { name: "Open ticket #385400" }).click();

    await expect.element(panel().getByRole("heading", { name: "Payroll export" })).toBeVisible();
    expect(history.location.pathname).toBe(
      `/projects/${projectId}/items/${itemId("Payroll export")}`,
    );
    expect(store.calls).toContain("FindTicketByNumber");
  });

  it("Says when Task Tracker holds no ticket with the parent number and stays put", async () => {
    const { history } = await openProject(parentTicket("Employee training data", "999999"));
    await card("Employee training data").dblClick();
    const path = history.location.pathname;
    const button = panel().getByTestId("parent-ticket-open");

    await button.click();

    await expect
      .element(panel().getByTestId("parent-ticket-message"))
      .toHaveTextContent("No ticket #999999 in Task Tracker");
    await expect.element(button).toBeEnabled();
    await expect.element(button).toHaveAccessibleName("Open ticket #999999");
    expect(history.location.pathname).toBe(path);
  });

  it("Shows a ToDo no ticket fields, even a ticket number it already has", async () => {
    await openProject();

    await card("Legacy numbered ToDo").dblClick();

    await expect.element(panel().getByTestId("details-kind")).toHaveTextContent("ToDo");
    await expect.element(panel().getByTestId("details-ticket")).not.toBeInTheDocument();
    await expect.element(panel().getByText("OLD-7")).not.toBeInTheDocument();
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
