import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

const PROJECT = {
  name: "ClockTower",
  items: [
    { title: "Employee training conversion" },
    { title: "Payroll export", kind: "Ticket" as const, ticketNumber: "385400" },
  ],
};

const dialog = () => page.getByTestId("add-item-dialog");
const content = () => page.getByTestId("add-item-content");
const card = (title: string) =>
  page.getByRole("treeitem", { name: title, exact: true }).getByTestId("item-row").first();

/** Seeds the ticket lists the quick-add pickers offer. */
function seedLists(store: FakeProjectStore) {
  const app = store.ticketFields.seed("Application", "ClockTower");
  const module = store.ticketFields.seed("Module", "Train", app.id);
  store.ticketFields.seed("Interface", "Conversion", module.id);
  store.ticketFields.seed("Person", "Elijah Harris");
}

async function openProject(configure?: (store: FakeProjectStore) => void) {
  const app = await renderApp({ projects: [PROJECT], ...(configure ? { configure } : {}) });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  const itemId = (title: string) =>
    app.store.findItemByTitle(projectId, null, title)?.item.id ?? "";
  return { ...app, projectId, itemId };
}

async function pick(name: string, option: string) {
  await dialog().getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
}

async function clickCardButton(title: string, testId: string) {
  await userEvent.hover(card(title));
  await card(title).getByTestId(testId).click();
}

describe("AddItemDialog", () => {
  it("Adds a ToDo under a card from its Add ToDo button with Enter", async () => {
    const { store, itemId } = await openProject();
    await clickCardButton("Employee training conversion", "item-card-add-todo");
    await expect.element(content()).toHaveAttribute("data-detailed", "false");
    for (const label of ["Description", "Priority", "Due date", "Due time", "Reminder"]) {
      await expect.element(dialog().getByText(label, { exact: true })).toBeVisible();
    }

    await dialog().getByTestId("add-title").click();
    await userEvent.keyboard("Call Melissa{Enter}");

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(store.ticketFields.lastAdd).toMatchObject({
      kind: "Todo",
      parentItemId: itemId("Employee training conversion"),
      fields: { title: "Call Melissa" },
    });
    await expect.element(page.getByText("Call Melissa", { exact: true })).toBeVisible();
  });

  it("Asks for a ticket number first, then saves a ticket with its levels and dispatcher", async () => {
    const { store } = await openProject(seedLists);
    await clickCardButton("Employee training conversion", "item-card-add-ticket");
    const number = dialog().getByTestId("add-ticket-number");
    await expect.element(dialog().getByTestId("add-title")).toBeVisible();
    await dialog().getByTestId("add-title").fill("Conversion data is wrong");
    await dialog().getByTestId("add-item-save").click();
    await expect
      .element(dialog().getByTestId("add-item-error"))
      .toHaveTextContent("A ticket needs a ticket number.");

    await number.fill("385405");
    await pick("Interface", "Conversion");
    await expect
      .element(dialog().getByRole("combobox", { name: "Module" }))
      .toHaveTextContent("ClockTower › Train");
    await pick("Dispatched to", "Elijah Harris");
    await dialog().getByTestId("add-item-save").click();

    await expect.element(dialog()).not.toBeInTheDocument();
    const added = store.ticketFields.lastAdd;
    expect(added).toMatchObject({ kind: "Ticket", fields: { ticketNumber: "385405" } });
    expect(added?.ticket?.interfaceId).not.toBeNull();
    expect(added?.ticket?.moduleId).not.toBeNull();
    expect(added?.ticket?.dispatchedToId).not.toBeNull();
  });

  it("Focuses the ticket number, the first field, when Add Ticket opens", async () => {
    await openProject();

    await page.getByTestId("workspace-add-ticket").click();

    await expect.element(dialog().getByTestId("add-ticket-number")).toHaveFocus();
  });

  it("Switches to the detailed view and back without losing what was typed", async () => {
    await openProject(seedLists);
    await page.getByTestId("workspace-add-ticket").click();
    await dialog().getByTestId("add-ticket-number").fill("385405");

    await dialog().getByTestId("add-item-expand").click();

    await expect.element(content()).toHaveAttribute("data-detailed", "true");
    await expect.element(dialog().getByTestId("add-requestor")).toBeVisible();
    await expect.element(dialog().getByTestId("add-ticket-number")).toHaveValue("385405");
    await dialog().getByTestId("add-item-expand").click();
    await expect.element(content()).toHaveAttribute("data-detailed", "false");
    await expect.element(dialog().getByTestId("add-ticket-number")).toHaveValue("385405");
  });

  it("Discards the draft when Escape closes the dialog", async () => {
    const { store } = await openProject();
    await page.getByTestId("workspace-add-todo").click();
    await dialog().getByTestId("add-title").fill("Forgotten");

    await userEvent.keyboard("{Escape}");
    await expect.element(dialog()).not.toBeInTheDocument();
    await page.getByTestId("workspace-add-todo").click();

    await expect.element(dialog().getByTestId("add-title")).toHaveValue("");
    expect(store.ticketFields.lastAdd).toBeNull();
  });

  it("Adds at the area's top level from the header buttons", async () => {
    const { store } = await openProject();
    await page.getByTestId("workspace-add-todo").click();
    await dialog().getByTestId("add-title").click();

    await userEvent.keyboard("Top level ToDo{Enter}");

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(store.ticketFields.lastAdd).toMatchObject({ kind: "Todo", parentItemId: null });
  });

  it("Opens Add Ticket straight to the detailed view when App Settings asks for it", async () => {
    await openProject((store) => {
      store.settingsAndLookups.globalSettings = {
        ...store.settingsAndLookups.globalSettings,
        addOpensDetails: { todo: false, ticket: true },
      };
    });

    await page.getByTestId("workspace-add-ticket").click();
    await expect.element(content()).toHaveAttribute("data-detailed", "true");
    await userEvent.keyboard("{Escape}");
    await page.getByTestId("workspace-add-todo").click();

    await expect.element(content()).toHaveAttribute("data-detailed", "false");
  });

  it("Takes a parent ticket as typed text and keeps the card as the place in the tree", async () => {
    const { store, itemId } = await openProject();
    await clickCardButton("Payroll export", "item-card-add-ticket");
    const parent = dialog().getByTestId("add-parent");
    await expect.element(parent).toHaveValue("385400");
    await expect.element(parent).toHaveAccessibleName("Parent ticket");

    await dialog().getByTestId("add-ticket-number").fill("385405");
    await dialog().getByTestId("add-title").fill("Badge reader offline");
    await parent.fill("JIRA-77");
    await dialog().getByTestId("add-item-save").click();

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(store.ticketFields.lastAdd).toMatchObject({
      kind: "Ticket",
      parentItemId: itemId("Payroll export"),
      ticket: { parentTicketNumber: "JIRA-77" },
    });
  });

  it("Offers the parent ticket in the detailed Add Ticket view too", async () => {
    await openProject();
    await page.getByTestId("workspace-add-ticket").click();

    await dialog().getByTestId("add-item-expand").click();

    await expect.element(dialog().getByTestId("add-parent")).toHaveValue("");
    await expect
      .element(dialog().getByRole("combobox", { name: "Parent ticket" }))
      .not.toBeInTheDocument();
  });

  it("Shows a ToDo no ticket fields in quick add or the detailed view", async () => {
    await openProject();
    await page.getByTestId("workspace-add-todo").click();

    for (const detailed of [false, true]) {
      await expect.element(content()).toHaveAttribute("data-detailed", String(detailed));
      for (const testId of ["add-ticket-number", "add-description", "add-module", "add-type"]) {
        await expect.element(dialog().getByTestId(testId)).not.toBeInTheDocument();
      }
      await expect.element(dialog().getByText("Parent ticket")).not.toBeInTheDocument();
      if (!detailed) {
        await dialog().getByTestId("add-item-expand").click();
      }
    }
  });
});
