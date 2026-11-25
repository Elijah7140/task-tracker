import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { BILLING_PROJECT } from "../support/workspace-seed.js";

const items = () => page.getByRole("tree", { name: "Items in Billing DB" });

const row = (name: string) => items().getByRole("treeitem", { name, exact: true });

const PARENT = "Add index to Invoice.CustomerId";

async function openRoot() {
  const app = await renderApp({ projects: [BILLING_PROJECT] });
  app.history.push(`/projects/${app.store.summaries[0]?.project.id}`);
  await expect.element(row(PARENT)).toBeVisible();
  return app;
}

async function focusRow(name: string) {
  row(name).element().focus();
  await expect.element(row(name)).toHaveFocus();
}

describe("ItemTree", () => {
  it("Describes each row's ticket, priority, date and urgency", async () => {
    await openRoot();

    await expect
      .element(row(PARENT))
      .toHaveAccessibleDescription(
        "Open, JIRA-1234, High, Due Nov 20, 2026, Overdue, from sub-item Check query plan before/after",
      );
    await expect
      .element(row("Investigate nightly export failure"))
      .toHaveAccessibleDescription("Open, OPS-88, Critical, Due Nov 14, 2026, 5:00 PM, Imminent");
    await expect
      .element(row("Schema review with the data team"))
      .toHaveAccessibleDescription("Open, Medium");
  });

  it("Shows open items first and finished items in a collapsed Completed section", async () => {
    await openRoot();

    const section = items().getByRole("treeitem", { name: "Completed (2)" });

    await expect.element(section).toHaveAttribute("aria-expanded", "false");
    await expect.element(row("Rotate service credentials")).not.toBeInTheDocument();
    await expect.element(row("Retire legacy billing views")).toBeVisible();
  });

  it("Lists completed items newest first when the section is expanded", async () => {
    await openRoot();

    await items().getByTestId("completed-section-toggle").last().click();

    const finished = items().getByRole("treeitem", { name: "Completed (2)" }).getByRole("treeitem");
    await expect.element(finished.nth(0)).toHaveAccessibleName("Rotate service credentials");
    await expect.element(finished.nth(1)).toHaveAccessibleName("Archive 2024 invoices");
    await expect
      .element(finished.nth(0))
      .toHaveAccessibleDescription("Completed, Done Nov 13, 2026");
  });

  it("Keeps a completed parent with an open sub-item in the open list, struck through", async () => {
    await openRoot();

    const title = row("Retire legacy billing views").getByTestId("item-title").first();

    await expect.element(title).toHaveClass(/line-through/);
    await expect
      .element(row("Retire legacy billing views").getByTestId("item-completion").first())
      .toHaveAttribute("data-completed", "true");
  });

  it("Shows a card's sub-items and a collapsed n completed section without expanding it", async () => {
    await openRoot();

    await expect.element(row(PARENT)).toHaveAttribute("aria-expanded", "true");
    await expect.element(row(PARENT).getByTestId("item-toggle")).not.toBeInTheDocument();
    await expect.element(row("Check query plan before/after")).toHaveAttribute("aria-level", "2");
    const finished = row(PARENT).getByRole("treeitem", { name: "2 completed" });
    await expect.element(finished).toHaveAttribute("aria-expanded", "false");
    await expect.element(row("Draft migration script")).not.toBeInTheDocument();
  });

  it("Moves focus and selection with the arrow keys and expands with Right", async () => {
    await openRoot();
    await focusRow(PARENT);

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(row("Check query plan before/after")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{ArrowDown}");

    await expect.element(row("Agree on index name")).toHaveFocus();
    await expect.element(row("Agree on index name")).toHaveAttribute("aria-selected", "true");
    await expect.element(row(PARENT)).toHaveAttribute("aria-selected", "false");
  });

  it("Returns to the parent and collapses it with Left, but never collapses a card", async () => {
    await openRoot();
    const finished = row(PARENT).getByRole("treeitem", { name: "2 completed" });
    await focusRow(PARENT);
    await userEvent.keyboard("{ArrowRight}{ArrowDown}{ArrowRight}{ArrowDown}");
    await expect.element(row("Agree on index name")).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await expect.element(finished).toHaveFocus();
    await expect.element(finished).toHaveAttribute("aria-expanded", "false");
    await expect.element(row("Agree on index name")).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");

    await expect.element(row(PARENT)).toHaveFocus();
    await expect.element(row(PARENT)).toHaveAttribute("aria-expanded", "true");
    await expect.element(row("Check query plan before/after")).toBeVisible();
  });

  it("Jumps to the first and last rows with Home and End", async () => {
    await openRoot();
    await focusRow("Tidy column comments");

    await userEvent.keyboard("{End}");
    await expect.element(items().getByRole("treeitem", { name: "Completed (2)" })).toHaveFocus();
    await userEvent.keyboard("{Home}");

    await expect.element(row("Retire legacy billing views")).toHaveFocus();
  });

  it("Selects a row when it is clicked", async () => {
    await openRoot();

    await row("Tidy column comments").getByTestId("item-row").first().click();

    await expect.element(row("Tidy column comments")).toHaveAttribute("aria-selected", "true");
    await expect.element(row("Tidy column comments")).toHaveFocus();
  });

  it("Names the sub-item behind a rolled-up urgency in a tooltip", async () => {
    await openRoot();
    const marker = row(PARENT).getByRole("img", {
      name: "From sub-item: Check query plan before/after",
    });

    await userEvent.hover(marker);

    await expect
      .element(page.getByTestId("urgency-source-tooltip"))
      .toHaveTextContent("From sub-item: Check query plan before/after");
  });

  it("Shows urgency as a labelled pill and bolds overdue titles", async () => {
    await openRoot();

    await expect
      .element(row(PARENT).getByTestId("item-urgency").first())
      .toHaveTextContent("Overdue");
    await expect
      .element(row(PARENT).getByTestId("item-title").first())
      .toHaveClass(/font-semibold/);
    await expect
      .element(row("Investigate nightly export failure").getByTestId("item-title").first())
      .not.toHaveClass(/font-semibold/);
  });

  it("Keeps expansion when returning to an area in the same session", async () => {
    const { store, history } = await openRoot();
    const finished = row(PARENT).getByRole("treeitem", { name: "2 completed" });
    await finished.getByTestId("completed-section-toggle").click();
    await expect.element(row("Draft migration script")).toBeVisible();

    history.push(
      `/projects/${store.summaries[0]?.project.id}/folders/${store.folderNamed("dbo").id}`,
    );
    await expect.element(page.getByRole("heading", { level: 1, name: "dbo" })).toBeVisible();
    history.back();

    await expect.element(row("Draft migration script")).toBeVisible();
  });
});
