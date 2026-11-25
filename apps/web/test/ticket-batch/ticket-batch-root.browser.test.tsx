import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { useThemeStore } from "../../src/state/theme-store.js";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderTicketBatch } from "../support/render-ticket-batch.js";
import { THEMES } from "../support/screenshots.js";

const DESTINATION_KEY = "task-tracker.add-tickets-destination";

const PROJECTS: ReadonlyArray<SeedProject> = [
  { name: "Billing", items: [] },
  {
    name: "ClockTower",
    folders: [
      { name: "Plant", items: [] },
      { name: "Line 2", parent: "Plant", items: [] },
    ],
    items: [],
  },
];

const view = () => page.getByTestId("ticket-batch");
const form = () => page.getByTestId("ticket-batch-form");
const list = () => page.getByTestId("ticket-batch-list");
const entries = () => list().getByTestId("ticket-batch-entry");
const done = () => page.getByTestId("ticket-batch-done");

/** Seeds the ticket lists the form's pickers offer. */
function seedLists(store: FakeProjectStore) {
  const app = store.ticketFields.seed("Application", "ClockTower");
  const module = store.ticketFields.seed("Module", "Train", app.id);
  store.ticketFields.seed("Interface", "Conversion", module.id);
  store.ticketFields.seed("Person", "Elijah Harris");
}

async function pick(name: string, option: string) {
  await view().getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
}

/** Types a ticket's number and summary and adds it with Enter, as from the keyboard. */
async function addTicket(number: string, summary: string) {
  await form().getByTestId("add-ticket-number").fill(number);
  await form().getByTestId("add-title").fill(summary);
  await form().getByTestId("add-title").click();
  await userEvent.keyboard("{Enter}");
}

/** Whether the page refuses to unload now, which makes Electron main ask first. */
function refusesUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  localStorage.removeItem(DESTINATION_KEY);
});

afterEach(() => {
  localStorage.removeItem(DESTINATION_KEY);
});

describe("adding tickets", () => {
  it("Shows quick add's ticket fields, Parent ticket as text, with the ticket number focused", async () => {
    await renderTicketBatch({ projects: PROJECTS });

    await expect.element(form().getByTestId("add-ticket-number")).toHaveFocus();

    for (const label of ["Ticket #", "Summary", "Detail", "Module", "Interface", "Priority"]) {
      await expect.element(form().getByText(label, { exact: true })).toBeVisible();
    }
    await expect.element(form().getByText("Dispatched to", { exact: true })).toBeVisible();
    await expect.element(form().getByTestId("add-parent")).toHaveAccessibleName("Parent ticket");
    await expect.element(form().getByTestId("add-parent")).toHaveValue("");
    await expect.element(page.getByTestId("ticket-batch-empty")).toBeVisible();
    await expect.element(done()).toBeDisabled();
  });

  it("Add moves a complete ticket to the list and clears the form for the next one", async () => {
    await renderTicketBatch({ projects: PROJECTS, configure: seedLists });
    await form().getByTestId("add-ticket-number").fill("385405");
    await form().getByTestId("add-title").fill("Conversion data is wrong");
    await pick("Interface", "Conversion");

    await form().getByTestId("ticket-batch-add").click();

    await expect.element(entries()).toHaveLength(1);
    await expect.element(entries().first()).toHaveTextContent("#385405 · Conversion data is wrong");
    await expect.element(form().getByTestId("add-ticket-number")).toHaveValue("");
    await expect.element(form().getByTestId("add-ticket-number")).toHaveFocus();
    await expect.element(list().getByRole("heading")).toHaveTextContent("To add (1)");
  });

  it("Add refuses a ticket without a number or summary and keeps what was typed", async () => {
    await renderTicketBatch({ projects: PROJECTS });
    await form().getByTestId("add-title").fill("No number yet");

    await form().getByTestId("ticket-batch-add").click();

    await expect
      .element(page.getByTestId("ticket-batch-form-error"))
      .toHaveTextContent("A ticket needs a ticket number.");
    await expect.element(form().getByTestId("add-title")).toHaveValue("No number yet");
    await expect.element(entries()).toHaveLength(0);
    await form().getByTestId("add-ticket-number").fill("12");
    await form().getByTestId("add-title").clear();
    await form().getByTestId("ticket-batch-add").click();
    await expect
      .element(page.getByTestId("ticket-batch-form-error"))
      .toHaveTextContent("Enter a summary.");
  });

  it("Edit moves a listed ticket back into a blank form, and Remove drops it", async () => {
    await renderTicketBatch({ projects: PROJECTS });
    await addTicket("1", "First");
    await addTicket("2", "Second");
    await form().getByTestId("add-title").fill("Typing");
    const edit = entries().first().getByTestId("ticket-batch-entry-edit");
    await expect.element(edit).toBeDisabled();
    await form().getByTestId("add-title").clear();

    await edit.click();

    await expect.element(form().getByTestId("add-ticket-number")).toHaveValue("1");
    await expect.element(form().getByTestId("add-title")).toHaveValue("First");
    await expect.element(entries()).toHaveLength(1);
    await entries().first().getByTestId("ticket-batch-entry-remove").click();
    await expect.element(entries()).toHaveLength(0);
    await expect.element(done()).toBeDisabled();
  });
});

describe("Done", () => {
  it("Adds every listed ticket in order to the chosen project and folder, then closes", async () => {
    const { store, onClose } = await renderTicketBatch({ projects: PROJECTS });
    await pick("Project", "ClockTower");
    await pick("Folder", " Line 2");
    await addTicket("385405", "Conversion data is wrong");
    await form().getByTestId("add-parent").fill("385400");
    await addTicket("385406", "Badge reader offline");

    await done().click();

    await expect.poll(() => onClose.mock.calls.length).toBe(1);
    const line2 = store.folderNamed("Line 2");
    expect(store.ticketFields.lastBatch).toMatchObject({
      projectId: line2.projectId,
      folderId: line2.id,
      tickets: [
        { fields: { ticketNumber: "385405", title: "Conversion data is wrong" } },
        {
          fields: { ticketNumber: "385406", title: "Badge reader offline" },
          ticket: { parentTicketNumber: "385400" },
        },
      ],
    });
    expect(store.findItemByTitle(line2.projectId, line2.id, "Badge reader offline")).toBeDefined();
    expect(JSON.parse(localStorage.getItem(DESTINATION_KEY) ?? "null")).toEqual({
      projectId: line2.projectId,
      folderId: line2.id,
    });
  });

  it("Starts at the last destination used on this device", async () => {
    const { store } = await renderTicketBatch({
      projects: PROJECTS,
      configure: (seeded) => {
        const plant = seeded.folderNamed("Plant");
        localStorage.setItem(
          DESTINATION_KEY,
          JSON.stringify({ projectId: plant.projectId, folderId: plant.id }),
        );
      },
    });

    await expect
      .element(view().getByRole("combobox", { name: "Project" }))
      .toHaveTextContent("ClockTower");
    await expect
      .element(view().getByRole("combobox", { name: "Folder" }))
      .toHaveTextContent("Plant");
    expect(store.ticketFields.lastBatch).toBeNull();
  });

  it("Marks the ticket the server refused, keeps the batch and stays open", async () => {
    const { store, onClose } = await renderTicketBatch({ projects: PROJECTS });
    await addTicket("1", "First");
    await addTicket("2", "Second");
    store.ticketFields.rejectNextBatch = {
      index: 1,
      message: "Interface 'Conversion' is archived.",
    };

    await done().click();

    await expect
      .element(page.getByTestId("ticket-batch-error"))
      .toHaveTextContent("Interface 'Conversion' is archived.");
    await expect.element(entries().nth(1)).toHaveAttribute("data-rejected", "true");
    await expect.element(entries().first()).not.toHaveAttribute("data-rejected");
    await expect.element(entries()).toHaveLength(2);
    expect(onClose).not.toHaveBeenCalled();
    expect(store.summaries.length).toBe(2);
  });
});

describe("closing", () => {
  it("Refuses to unload while tickets or typing are unsaved, and not once Done saved them", async () => {
    const { onClose } = await renderTicketBatch({ projects: PROJECTS });
    expect(refusesUnload()).toBe(false);
    await form().getByTestId("add-title").fill("Half typed");
    await expect.poll(refusesUnload).toBe(true);
    await form().getByTestId("add-ticket-number").fill("7");
    await form().getByTestId("ticket-batch-add").click();
    await expect.element(entries()).toHaveLength(1);
    expect(refusesUnload()).toBe(true);

    await done().click();

    await expect.poll(() => onClose.mock.calls.length).toBe(1);
    expect(refusesUnload()).toBe(false);
  });

  it("Explains that a project is needed when there are none", async () => {
    await renderTicketBatch();

    await expect
      .element(page.getByTestId("ticket-batch-no-projects").getByText("No projects yet."))
      .toBeVisible();
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  async function settle() {
    useThemeStore.setState({ preference: theme });
    await userEvent.hover(page.getByTestId("ticket-batch-window"), {
      force: true,
      position: { x: 2, y: 2 },
    });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  it("The view with listed tickets matches the baseline", async () => {
    await renderTicketBatch({ projects: PROJECTS, configure: seedLists });
    await addTicket("385405", "Employee training conversion data is not correct");
    await addTicket("385406", "Badge reader offline at the north gate");
    await form().getByTestId("add-ticket-number").fill("385407");
    await form().getByTestId("add-title").fill("Shift report totals are doubled");
    await pick("Dispatched to", "Elijah Harris");

    await settle();

    await expect
      .element(page.getByTestId("ticket-batch-window"))
      .toMatchScreenshot(`ticket-batch-${theme}`);
  });
});
