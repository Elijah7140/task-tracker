import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { openMenu } from "../support/menu-bar.js";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

/** A ticket's Detail on its card (§7.17). */

const DETAIL = "Qualifications are **missing** for line 2.\n\n- Check the import\n- Ask HR";

const PROJECT: SeedProject = {
  name: "ClockTower",
  items: [
    {
      title: "Employee training data",
      kind: "Ticket",
      ticketNumber: "385405",
      description: DETAIL,
      notes: "Asked Wayne.",
    },
    {
      title: "Payroll export",
      kind: "Ticket",
      ticketNumber: "385400",
      description: "Stops at the contractor.",
      showDetail: false,
    },
    { title: "Plain ToDo", notes: "Book the room." },
  ],
};

const card = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const header = (title: string) => card(title).getByTestId("item-card-header").first();
const detail = (title: string) => card(title).getByTestId("item-card-detail");
const contextMenu = () => page.getByTestId("item-context-menu");

async function openProject() {
  const app = await renderApp({ projects: [PROJECT] });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(card("Employee training data")).toBeVisible();
  return app;
}

describe("Ticket Detail on cards", () => {
  it("Shows a ticket's Detail as Markdown above its notes, whole", async () => {
    await openProject();

    await expect.element(detail("Employee training data")).toBeVisible();
    await expect
      .element(detail("Employee training data").getByText("missing", { exact: true }))
      .toBeVisible();
    await expect.element(detail("Employee training data").getByText("Ask HR")).toBeVisible();
    const detailBox = detail("Employee training data").element();
    const notesBox = card("Employee training data")
      .getByTestId("item-card-notes-preview")
      .element();
    expect(detailBox.compareDocumentPosition(notesBox) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(getComputedStyle(detailBox.firstElementChild!).webkitLineClamp).toMatch(/none|^$/);
  });

  it("Leaves the Detail off a ticket that hides it and off every ToDo", async () => {
    await openProject();

    await expect.element(detail("Payroll export")).not.toBeInTheDocument();
    await expect.element(detail("Plain ToDo")).not.toBeInTheDocument();
  });

  it("Offers Hide or Show description in a ticket's card menu and never on a ToDo", async () => {
    await openProject();

    await header("Employee training data").click({ button: "right" });
    await expect
      .element(contextMenu().getByTestId("item-menu-toggle-detail"))
      .toHaveTextContent("Hide description");
    await userEvent.keyboard("{Escape}");
    await header("Payroll export").click({ button: "right" });
    await expect
      .element(contextMenu().getByTestId("item-menu-toggle-detail"))
      .toHaveTextContent("Show description");
    await userEvent.keyboard("{Escape}");
    await header("Plain ToDo").click({ button: "right" });

    await expect.element(contextMenu()).toBeVisible();
    await expect
      .element(contextMenu().getByTestId("item-menu-toggle-detail"))
      .not.toBeInTheDocument();
  });

  it("Hides a card's Detail as one undo step and Edit › Undo shows it again", async () => {
    const { store } = await openProject();
    await header("Employee training data").click({ button: "right" });

    await contextMenu().getByTestId("item-menu-toggle-detail").click();

    await expect.element(detail("Employee training data")).not.toBeInTheDocument();
    expect(store.calls).toContain("SetTicketDetailOnCard");
    await openMenu("edit");
    await page
      .getByRole("menuitem", { name: "Undo: Hide description of 'Employee training data'" })
      .click();
    await expect.element(detail("Employee training data")).toBeVisible();
  });

  it("Shows a hidden Detail from the ⋯ menu", async () => {
    await openProject();
    await userEvent.hover(header("Payroll export"));

    await header("Payroll export").getByTestId("item-menu").click();
    await page.getByTestId("item-menu-toggle-detail").click();

    await expect.element(detail("Payroll export")).toHaveTextContent("Stops at the contractor.");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed ticket card with its Detail", async () => {
      await openProject();
      await settleTheme(theme);

      await expect
        .element(card("Employee training data"))
        .toMatchScreenshot(`card-detail-${theme}`);
    });
  });
});
