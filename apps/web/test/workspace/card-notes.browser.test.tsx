import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

const PROJECT: SeedProject = {
  name: "Notes",
  items: [
    { title: "Plan rollout", notes: "Steps:\n\n- Draft email\n- Book room" },
    { title: "Empty card" },
    {
      title: "Payroll export fails",
      kind: "Ticket",
      ticketNumber: "385405",
      description: "The export stops at the first contractor.",
    },
  ],
};

const card = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const editor = () => page.getByTestId("item-card-notes-editor");

async function openProject() {
  const app = await renderApp({ projects: [PROJECT] });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  const stored = (title: string) => app.store.findItemByTitle(projectId, null, title)?.item;
  const storedNotes = (title: string) => stored(title)?.notes;
  return { ...app, projectId, stored, storedNotes };
}

describe("CardNotes", () => {
  it("Renders a card's Markdown notes in full with bullet lists as a list", async () => {
    await openProject();

    const notes = card("Plan rollout").getByTestId("item-card-notes");

    await expect.element(notes.getByText("Steps:")).toBeVisible();
    await expect.element(notes.getByRole("list")).toBeVisible();
    expect(
      notes
        .getByRole("listitem")
        .elements()
        .map((item) => item.textContent),
    ).toEqual(["Draft email", "Book room"]);
  });

  it("Edits the raw Markdown inline and saves it once with Ctrl+Enter", async () => {
    const { store, history, storedNotes } = await openProject();
    const path = history.location.pathname;
    await card("Plan rollout").getByTestId("item-card-notes").click();
    await expect.element(editor()).toHaveFocus();
    await expect.element(editor()).toHaveValue("Steps:\n\n- Draft email\n- Book room");

    await userEvent.keyboard("{Control>}{End}{/Control}{Enter}- Order snacks");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await expect.element(editor()).not.toBeInTheDocument();
    await expect
      .element(card("Plan rollout").getByRole("listitem").nth(2))
      .toHaveTextContent("Order snacks");
    expect(storedNotes("Plan rollout")).toBe(
      "Steps:\n\n- Draft email\n- Book room\n- Order snacks",
    );
    expect(store.calls.filter((call) => call === "EditItem")).toHaveLength(1);
    expect(history.location.pathname).toBe(path);
    await expect.element(card("Plan rollout")).toHaveFocus();
  });

  it("Saves the notes when the editor loses focus", async () => {
    const { storedNotes } = await openProject();
    await card("Empty card").getByTestId("item-card-header").click();
    await card("Empty card").getByRole("button", { name: "Add notes to Empty card" }).click();
    await expect.element(editor()).toHaveFocus();

    await userEvent.keyboard("- First point");
    await page.getByRole("heading", { level: 1 }).click();

    await expect.element(card("Empty card").getByRole("listitem")).toHaveTextContent("First point");
    expect(storedNotes("Empty card")).toBe("- First point");
  });

  it("Cancels an inline edit with Escape and keeps the stored notes", async () => {
    const { store, storedNotes } = await openProject();
    await card("Plan rollout").getByTestId("item-card-notes").click();
    await expect.element(editor()).toHaveFocus();

    await userEvent.keyboard("{Control>}a{/Control}Replaced");
    await userEvent.keyboard("{Escape}");

    await expect.element(editor()).not.toBeInTheDocument();
    await expect.element(card("Plan rollout").getByText("Draft email")).toBeVisible();
    expect(storedNotes("Plan rollout")).toBe("Steps:\n\n- Draft email\n- Book room");
    expect(store.calls).not.toContain("EditItem");
    await expect.element(card("Plan rollout")).toHaveFocus();
  });

  it("Shows Add notes on an empty card only on hover or selection", async () => {
    await openProject();
    const add = card("Empty card").getByTestId("item-card-notes-add");

    await expect.element(add).toHaveClass(/opacity-0/);
    await card("Empty card").getByTestId("item-card-header").click();

    await expect.element(add).toHaveClass(/opacity-100/);
    await expect.element(add).not.toHaveClass(/opacity-0/);
  });

  it("Saves a ticket's notes apart from its Detail", async () => {
    const { stored } = await openProject();
    const ticket = card("Payroll export fails");
    await ticket.getByTestId("item-card-header").click();
    await ticket.getByRole("button", { name: "Add notes to Payroll export fails" }).click();
    await expect.element(editor()).toHaveValue("");

    await userEvent.keyboard("Called the vendor.");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await expect.element(ticket.getByText("Called the vendor.")).toBeVisible();
    expect(stored("Payroll export fails")).toMatchObject({
      description: "The export stops at the first contractor.",
      notes: "Called the vendor.",
    });
  });
});
