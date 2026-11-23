import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { NO_TICKET_FIELDS } from "../support/fake-ticket-fields.js";
import { renderApp } from "../support/render-app.js";

const PROJECT = {
  name: "ClockTower",
  items: [{ title: "Employee training data", kind: "Ticket" as const, ticketNumber: "385405" }],
};

const HIDDEN_FIELDS = {
  version: "1.0.0",
  estimatedHours: 4,
  percentComplete: 50,
  isUrgent: true,
  isSystemOutage: true,
};

const editor = () => page.getByRole("dialog", { name: "Edit ticket" });

async function openTicketEditor() {
  const app = await renderApp({
    projects: [PROJECT],
    configure: (store) => {
      const ticketId = store.findItemByTitle(
        store.summaries[0]?.project.id ?? "",
        null,
        PROJECT.items[0]!.title,
      )?.item.id;
      store.ticketFields.seed("TicketType", "Defect");
      store.ticketFields.details.set(ticketId ?? "", { ...NO_TICKET_FIELDS, ...HIDDEN_FIELDS });
    },
  });
  app.history.push(`/projects/${app.store.summaries[0]?.project.id}`);
  const card = page
    .getByRole("treeitem", { name: "Employee training data", exact: true })
    .getByTestId("item-card-header")
    .first();
  await card.dblClick();
  await page.getByTestId("details-edit").click();
  await expect.element(editor()).toBeVisible();
  return app;
}

describe("TicketSection in the item editor", () => {
  it("Shows the ticket's fixed fields instead of the ToDo-only sections", async () => {
    await openTicketEditor();

    await expect.element(editor().getByTestId("item-editor-ticket-fields")).toBeVisible();
    await expect.element(editor().getByTestId("ticket-editor-ticketTypeId")).toBeVisible();
    await expect.element(editor().getByTestId("item-editor-type")).not.toBeInTheDocument();
    await expect.element(editor().getByTestId("item-editor-repeat")).not.toBeInTheDocument();
    await expect.element(editor().getByTestId("item-editor-due-date")).toBeVisible();
  });

  it("Leaves out version, hours, percent and the urgent and outage flags", async () => {
    await openTicketEditor();

    await expect.element(editor().getByTestId("item-editor-ticket-fields")).toBeVisible();
    await expect.element(editor().getByTestId("ticket-editor-version")).not.toBeInTheDocument();
    await expect.element(editor().getByText("Est. hours")).not.toBeInTheDocument();
    await expect.element(editor().getByText("% complete")).not.toBeInTheDocument();
    await expect.element(editor().getByText("Urgent")).not.toBeInTheDocument();
    await expect.element(editor().getByText("System outage")).not.toBeInTheDocument();
  });

  it("Saves a changed ticket type and keeps the stored hidden fields", async () => {
    const { store } = await openTicketEditor();
    const typeId = store.ticketFields.entries[0]?.id ?? "";

    await editor().getByRole("combobox", { name: "Ticket type", exact: true }).click();
    await page.getByRole("option", { name: "Defect", exact: true }).click();
    await editor().getByTestId("item-editor-save").click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(store.ticketFields.lastEditTicket).toEqual({
      ...NO_TICKET_FIELDS,
      ...HIDDEN_FIELDS,
      ticketTypeId: typeId,
    });
  });

  it("Sends no ticket fields when only the summary changes", async () => {
    const { store } = await openTicketEditor();
    await expect.element(editor().getByTestId("item-editor-ticket-fields")).toBeVisible();

    await editor().getByTestId("item-editor-title").fill("Training data is wrong");
    await editor().getByTestId("item-editor-save").click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(store.ticketFields.lastEditTicket).toBeUndefined();
  });
});
