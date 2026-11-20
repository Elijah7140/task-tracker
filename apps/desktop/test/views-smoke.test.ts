import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "./support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  chooseMenuCommand,
  createProject,
  expectFocused,
  expectGone,
  itemRow,
  localDate,
  openItemEditor,
  openProject,
  saveItemEditor,
  selectItem,
} from "./support/workflows.js";

/** A ticket row on the Tickets page, named after its item. */
function ticketRow(page: Page, title: string) {
  return page.getByTestId("tickets-page").getByRole("listitem", { name: title, exact: true });
}

/** A priority section of the Tickets page. */
function ticketSection(page: Page, label: string) {
  return page.getByTestId("tickets-page").getByRole("region", { name: label, exact: true });
}

/**
 * Says which section holds the ticket, what has focus and any error the
 * Tickets page shows, so a failed wait reports what actually happened.
 */
function describeTicketsPage(page: Page, title: string) {
  return page.getByTestId("tickets-page").evaluate((root, name) => {
    const rows = [...root.querySelectorAll("[data-testid=ticket-row]")];
    const row = rows.find((candidate) => candidate.getAttribute("aria-label") === name);
    const section = row?.closest("section")?.getAttribute("aria-label") ?? "no section";
    const active = document.activeElement;
    const focus =
      active?.getAttribute("aria-label") ?? active?.getAttribute("data-testid") ?? active?.tagName;
    const error = root.querySelector("[data-testid=tickets-error]")?.textContent ?? "none";
    return `"${name}" is in ${section}, focus is on ${focus}, page error: ${error}`;
  }, title);
}

/** Waits for the ticket in the named section, or fails naming where it is instead. */
async function expectTicketIn(page: Page, title: string, label: string) {
  try {
    await ticketSection(page, label).getByRole("listitem", { name: title, exact: true }).waitFor();
  } catch (error) {
    const actual = await describeTicketsPage(page, title);
    throw new Error(`Expected "${title}" in ${label}, but ${actual}`, { cause: error });
  }
}

/** A row of the Today page with the item's title button. */
function todayRow(page: Page, title: string) {
  return page
    .getByTestId("today-item-row")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
}

/** Matches exactly `text`, for a filter that waits for a shown value to change. */
function exactText(text: string) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

/** Reads the due date shown in the item's editor and closes it again. */
async function shownDueDate(page: Page, title: string) {
  const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
  const due = await editor.getByLabel("Due date", { exact: true }).inputValue();
  await page.keyboard.press("Escape");
  await expectGone(editor);
  return due;
}

desktopTest(
  "Setting a status from the row menu shows the status chip, also after relaunch",
  async ({ desktop }) => {
    const title = "Review release notes";
    const chip = (page: Page) =>
      itemRow(page, SMOKE_PROJECT, title).getByTestId("item-status-chip");
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, title);

      await itemRow(page, SMOKE_PROJECT, title)
        .getByTestId("item-title")
        .first()
        .click({ button: "right" });
      await page.getByTestId("item-menu-set-status").click();
      await page.getByRole("menuitemradio", { name: "Testing", exact: true }).click();

      await expect.poll(() => chip(page).innerText()).toBe("Testing");
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);

      await expect.poll(() => chip(page).innerText()).toBe("Testing");
    });
  },
);

desktopTest(
  "Alt+Down on Tickets moves the focused ticket into the next priority, also after relaunch",
  async ({ desktop }) => {
    const title = "Reconcile payments";
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, title);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, title));
      await editor.getByLabel("Ticket number", { exact: true }).fill("PAY-17");
      await saveItemEditor(editor);

      await chooseMenuCommand(page, "view", "menu-tickets");
      await expectTicketIn(page, title, "No priority");
      await ticketRow(page, title).click();
      // Alt+Down acts on the focused row, so a key sent before the press focuses it is lost.
      await expectFocused(ticketRow(page, title));
      await page.keyboard.press("Alt+ArrowDown");

      await expectTicketIn(page, title, "Critical");
    });

    await withDesktop(desktop, async (page) => {
      await chooseMenuCommand(page, "view", "menu-tickets");

      await expectTicketIn(page, title, "Critical");
      expect(await ticketRow(page, title).innerText()).toContain("PAY-17");
    });
  },
);

desktopTest(
  "Today shows a task completed today and push back moves another task's due date, also after relaunch",
  async ({ desktop }) => {
    const done = "Filed report";
    const moved = "Send follow-up";
    const due = localDate(0);
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, done);
      await itemRow(page, SMOKE_PROJECT, done).getByTestId("item-completion").first().click();
      await expectGone(itemRow(page, SMOKE_PROJECT, done));

      await chooseMenuCommand(page, "view", "menu-today");
      await todayRow(page, done).waitFor();
      await page.getByTestId("today-back").click();
      await expectGone(page.getByTestId("today-page"));

      await addItem(page, SMOKE_PROJECT, moved);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, moved));
      await editor.getByLabel("Due date", { exact: true }).fill(due);
      await saveItemEditor(editor);
      // Push back acts on the row as shown, so wait until the row shows the saved due date.
      const shownDate = itemRow(page, SMOKE_PROJECT, moved).getByTestId("item-date").first();
      const savedDateText = await shownDate.innerText();
      await selectItem(page, SMOKE_PROJECT, moved);
      await page.keyboard.press("Control+Shift+P");

      await itemRow(page, SMOKE_PROJECT, moved)
        .getByTestId("item-date")
        .filter({ hasNotText: exactText(savedDateText) })
        .first()
        .waitFor();
      expect(await shownDueDate(page, moved)).toBe(localDate(1));
    });

    await withDesktop(desktop, async (page) => {
      await chooseMenuCommand(page, "view", "menu-today");
      await todayRow(page, done).waitFor();
      await page.keyboard.press("Escape");
      await expectGone(page.getByTestId("today-page"));
      await openProject(page);

      expect(await shownDueDate(page, moved)).toBe(localDate(1));
    });
  },
);
