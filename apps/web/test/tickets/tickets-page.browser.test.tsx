import type {} from "@vitest/browser-playwright";
import { expect, it, onTestFinished } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";

const REVIEW = "Review payment reconciliation";
const FIX = "Fix statement import";
const HOTFIX_ID = "019A0000-0000-7000-8000-000000002907";
const ARCHIVED_ID = "019A0000-0000-7000-8000-000000002908";

const heading = () => page.getByRole("heading", { name: "Tickets", exact: true, level: 1 });
const filter = () => page.getByRole("combobox", { name: "Project filter" });
const back = () => page.getByTestId("tickets-back");
const row = (title: string) => page.getByRole("listitem", { name: title, exact: true });
const section = (label: string) => page.getByRole("region", { name: label, exact: true });
const sectionHeader = (label: string) => section(label).getByTestId("ticket-section-header");
const menu = () => page.getByTestId("ticket-row-menu");
const choice = (name: string) => page.getByRole("menuitemradio", { name, exact: true });
const shortcut = () => userEvent.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
const altKey = (key: "ArrowUp" | "ArrowDown") => userEvent.keyboard(`{Alt>}{${key}}{/Alt}`);

/** The section label a ticket row is listed under, read from the rendered page. */
function sectionOf(title: string) {
  const element = row(title).query();
  return element?.closest("[data-testid=ticket-section]")?.getAttribute("aria-label") ?? null;
}

/** Titles listed in a section, in display order. */
function titlesIn(label: string) {
  return section(label)
    .getByRole("listitem")
    .elements()
    .map((element) => element.getAttribute("aria-label"));
}

const billing = (extra: SeedProject["items"] = []): SeedProject => ({
  name: "Billing",
  items: [
    { title: REVIEW, ticketNumber: "PAY-173", status: "Testing", dueDate: "2026-11-20" },
    { title: "Untracked work" },
    ...extra,
  ],
});

const portal: SeedProject = {
  name: "Customer portal",
  items: [
    { title: FIX, ticketNumber: "WEB-42", priority: "Critical", dueDate: "2026-11-23" },
    { title: "Closed ticket", ticketNumber: "WEB-7", completedAtUtc: "2026-11-12T10:00:00Z" },
  ],
};

function level(id: string, name: string, number: number | null, sortOrder: number) {
  const label = number === null ? name : `${number} · ${name}`;
  return { id, name, number, label, colorKey: null, isBuiltIn: false, sortOrder };
}

/** Adds "7 · Hotfix" holding "Update invoice preview", plus an archived level with a ticket. */
function addSections(store: FakeProjectStore) {
  store.settingsAndLookups.priorityLevels.push(
    { ...level(HOTFIX_ID, "Hotfix", 7, 4), isArchived: false },
    { ...level(ARCHIVED_ID, "Retired", null, 5), isArchived: true },
  );
  const portalId = store.summaries[1]!.project.id;
  const update = store.addItem(portalId, null, { title: "Update invoice preview" });
  store.patchItem(update.item.id, {
    ticketNumber: "WEB-81",
    priorityLevelId: HOTFIX_ID,
    statusId: "019A0000-0000-7000-8000-000000000202",
  });
  const legacy = store.addItem(portalId, null, { title: "Legacy export" });
  store.patchItem(legacy.item.id, { ticketNumber: "WEB-3", priorityLevelId: ARCHIVED_ID });
}

interface OpenOptions {
  readonly configure?: (store: FakeProjectStore) => void;
  readonly clock?: ReturnType<typeof createTestClock>["clock"];
  readonly projects?: ReadonlyArray<SeedProject>;
}

async function openTickets({ configure, clock, projects }: OpenOptions = {}) {
  const app = await renderApp({
    projects: projects ?? [billing(), portal],
    ...(clock === undefined ? {} : { clock }),
    ...(configure === undefined ? {} : { configure }),
  });
  await page.getByTestId("sidebar-tickets").click();
  await expect.element(heading()).toBeVisible();
  return app;
}

async function focusRow(title: string) {
  await row(title).click();
  await expect.element(row(title)).toHaveFocus();
}

async function openWorkspace(name: string) {
  await page.getByRole("article", { name }).click();
  await expect.element(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

function point(element: Element, fraction = 0.5) {
  const rect = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  return {
    x: Math.round((frame?.left ?? 0) + rect.left + Math.min(40, rect.width / 2)),
    y: Math.round((frame?.top ?? 0) + rect.top + rect.height * fraction),
  };
}

type Point = ReturnType<typeof point>;

const mouse = (
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  at: Point,
  buttons: number,
  button: "left" | "none" = "none",
) => cdp().send("Input.dispatchMouseEvent", { ...at, type, buttons, button, clickCount: 1 });

/** Presses on a row and moves past the drag threshold to `target`. */
async function beginDrag(title: string, target: Point) {
  const from = point(row(title).element());
  await mouse("mouseMoved", from, 0);
  await mouse("mousePressed", from, 1, "left");
  onTestFinished(async () => {
    await mouse("mouseReleased", target, 0, "left");
  });
  await mouse("mouseMoved", { ...from, y: from.y + 6 }, 1);
  await mouse("mouseMoved", target, 1);
}

async function openRowMenu(title: string) {
  await row(title).click({ button: "right" });
  await expect.element(menu()).toBeVisible();
}

it("Opens from the sidebar and Ctrl+Shift+K over the same return page, focusing the filter", async () => {
  await renderApp({ projects: [billing(), portal] });
  const home = page.getByRole("heading", { name: "Projects", exact: true, level: 1 });
  await expect.element(home).toBeVisible();

  await page.getByTestId("sidebar-tickets").click();
  await expect.element(filter()).toHaveFocus();
  await expect.element(filter()).toHaveTextContent("All projects");
  await expect.element(page.getByTestId("sidebar-tickets")).toHaveAttribute("aria-current", "page");
  await back().click();
  await expect.element(home).toBeVisible();
  await shortcut();
  await expect.element(heading()).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.keyboard("{Control>}f{/Control}");
  await shortcut();
  await expect.element(heading()).toBeVisible();
  await userEvent.keyboard("{Escape}");

  await expect.element(home).toBeVisible();
  await expect.element(heading()).not.toBeInTheDocument();
});

it("Lists open numbered items with their number, project, status and due date", async () => {
  await openTickets({ configure: addSections });

  for (const cell of ["PAY-173", "Billing", "Testing", "Nov 20, 2026"]) {
    await expect.element(row(REVIEW).getByText(cell, { exact: true })).toBeVisible();
  }
  await expect.element(row("Untracked work")).not.toBeInTheDocument();
  await expect.element(row("Closed ticket")).not.toBeInTheDocument();
  expect(titlesIn("No priority")).toEqual([REVIEW]);
  expect(titlesIn("Critical")).toEqual([FIX]);
  await expect.element(sectionHeader("Low")).toBeVisible();
  expect(titlesIn("7 · Hotfix")).toEqual(["Update invoice preview"]);
  expect(titlesIn("Retired")).toEqual(["Legacy export"]);
});

it("Keyboard moves cross the section boundary and keep focus for the next move", async () => {
  const { store } = await openTickets();
  await focusRow(REVIEW);

  await altKey("ArrowDown");
  await expect.poll(() => titlesIn("Critical")).toEqual([REVIEW, FIX]);
  await expect.element(row(REVIEW)).toHaveFocus();
  await altKey("ArrowDown");
  await expect.poll(() => titlesIn("Critical")).toEqual([FIX, REVIEW]);
  await altKey("ArrowUp");
  await expect.poll(() => titlesIn("Critical")).toEqual([REVIEW, FIX]);
  await altKey("ArrowUp");

  await expect.poll(() => sectionOf(REVIEW)).toBe("No priority");
  await expect.element(row(REVIEW)).toHaveFocus();
  expect(store.calls.filter((call) => call === "MoveTicket")).toHaveLength(4);
  await altKey("ArrowUp");
  expect(store.calls.filter((call) => call === "MoveTicket")).toHaveLength(4);
});

it("Ignores another move while one is saving", async () => {
  const { store } = await openTickets();
  await focusRow(REVIEW);
  const release = store.hold("MoveTicket");

  await altKey("ArrowDown");
  await altKey("ArrowDown");
  release();

  await expect.poll(() => titlesIn("Critical")).toEqual([REVIEW, FIX]);
  expect(store.calls.filter((call) => call === "MoveTicket")).toHaveLength(1);
});

it("Dragging below a ticket sets its priority and dropping on No priority clears it", async () => {
  await openTickets();
  const target = row(FIX).element();
  const lowerEdge = point(target, 0.9);

  await beginDrag(REVIEW, lowerEdge);
  await expect.element(row(FIX)).toHaveAttribute("data-drop", "after");
  await expect.element(row(REVIEW)).toHaveAttribute("data-dragging");
  await mouse("mouseReleased", lowerEdge, 0, "left");
  await expect.poll(() => titlesIn("Critical")).toEqual([FIX, REVIEW]);
  await expect.element(row(REVIEW)).toHaveFocus();
  const header = point(sectionHeader("No priority").element());
  await beginDrag(REVIEW, header);
  await expect.element(sectionHeader("No priority")).toHaveAttribute("data-drop", "after");
  await mouse("mouseReleased", header, 0, "left");

  await expect.poll(() => sectionOf(REVIEW)).toBe("No priority");
});

it("Offers no drop into an archived level and leaves its tickets movable", async () => {
  const { store } = await openTickets({ configure: addSections });
  const header = point(sectionHeader("Retired").element());

  await beginDrag(REVIEW, header);
  await expect.element(sectionHeader("Retired")).not.toHaveAttribute("data-drop");
  await mouse("mouseReleased", header, 0, "left");
  await focusRow("Legacy export");
  await altKey("ArrowUp");

  await expect.poll(() => sectionOf("Legacy export")).toBe("7 · Hotfix");
  expect(store.calls.filter((call) => call === "MoveTicket")).toHaveLength(1);
  await expect.element(section("Retired")).not.toBeInTheDocument();
});

it("Escape cancels a drag and leaves the Tickets page open", async () => {
  const { store } = await openTickets();
  const target = point(row(FIX).element(), 0.9);

  await beginDrag(REVIEW, target);
  await expect.element(row(FIX)).toHaveAttribute("data-drop", "after");
  await userEvent.keyboard("{Escape}");
  await mouse("mouseReleased", target, 0, "left");

  await expect.element(heading()).toBeVisible();
  await expect.element(row(FIX)).not.toHaveAttribute("data-drop");
  expect(store.calls).not.toContain("MoveTicket");
  expect(sectionOf(REVIEW)).toBe("No priority");
});

it("Holding a drag near the bottom edge scrolls to an offscreen ticket and stops on release", async () => {
  const { clock, advance } = createTestClock();
  const items = Array.from({ length: 36 }, (_, index) => ({
    title: `Ticket ${index}`,
    ticketNumber: `T-${index}`,
  }));
  await openTickets({ clock, projects: [{ name: "Billing", items }] });
  await expect.element(row("Ticket 35")).toBeInTheDocument();
  const scroller = page.getByTestId("tickets-scroll").element();
  const viewport = scroller.getBoundingClientRect();
  const edge = { ...point(row("Ticket 0").element()), y: point(scroller, 1).y - 5 };
  expect(point(row("Ticket 35").element()).y).toBeGreaterThan(edge.y);

  await beginDrag("Ticket 0", edge);
  await advance("100 millis");
  expect(scroller.scrollTop).toBeGreaterThan(0);
  await advance("10 seconds");
  expect(scroller.scrollTop).toBe(scroller.scrollHeight - scroller.clientHeight);
  const drop = point(row("Ticket 35").element(), 0.9);
  expect(drop.y).toBeLessThan(
    viewport.bottom + (window.frameElement?.getBoundingClientRect().top ?? 0),
  );
  await mouse("mouseMoved", drop, 1);
  await expect.element(row("Ticket 35")).toHaveAttribute("data-drop", "after");
  await mouse("mouseReleased", drop, 0, "left");

  await expect.poll(() => titlesIn("No priority").at(-1)).toBe("Ticket 0");
  await expect.element(row("Ticket 0")).toHaveFocus();
});

it("Holding a drag near the top edge scrolls up and Escape stops the scroll", async () => {
  const { clock, advance } = createTestClock();
  const items = Array.from({ length: 36 }, (_, index) => ({
    title: `Ticket ${index}`,
    ticketNumber: `T-${index}`,
  }));
  await openTickets({ clock, projects: [{ name: "Billing", items }] });
  await expect.element(row("Ticket 35")).toBeInTheDocument();
  const scroller = page.getByTestId("tickets-scroll").element();
  scroller.scrollTop = scroller.scrollHeight;
  const bottom = scroller.scrollTop;
  const edge = { ...point(row("Ticket 35").element()), y: point(scroller, 0).y + 4 };

  await beginDrag("Ticket 35", edge);
  await advance("100 millis");
  expect(scroller.scrollTop).toBeLessThan(bottom);
  await userEvent.keyboard("{Escape}");
  const stopped = scroller.scrollTop;
  await advance("1 second");

  expect(scroller.scrollTop).toBe(stopped);
  await expect.element(heading()).toBeVisible();
});

it.each([
  ["the Menu key", "{ContextMenu}"],
  ["Shift+F10", "{Shift>}{F10}{/Shift}"],
])("Opens the focused ticket's menu with %s and Open shows it in its workspace", async (_, key) => {
  await openTickets();
  await focusRow(REVIEW);

  await userEvent.keyboard(key);
  await expect.element(menu()).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Set status" })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Set priority" })).toBeVisible();
  await expect
    .element(page.getByTestId("item-menu-push-back"))
    .not.toHaveAttribute("data-disabled");
  await page.getByRole("menuitem", { name: "Open" }).click();

  await expect.element(heading()).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("treeitem", { name: REVIEW, exact: true }))
    .toHaveAttribute("aria-selected", "true");
});

it("Setting a priority from the keyboard menu keeps the ticket focused for Alt+Down", async () => {
  await openTickets();
  await focusRow(REVIEW);

  await userEvent.keyboard("{ContextMenu}");
  await page.getByRole("menuitem", { name: "Set priority" }).click();
  await choice("Critical").click();
  await expect.poll(() => titlesIn("Critical")).toEqual([FIX, REVIEW]);
  await expect.element(row(REVIEW)).toHaveFocus();
  await altKey("ArrowDown");

  await expect.poll(() => sectionOf(REVIEW)).toBe("High");
  expect(sectionOf(FIX)).toBe("Critical");
});

it("Filtering by project hides other tickets and Enter opens the focused ticket", async () => {
  await openTickets();

  await filter().click();
  await page.getByRole("option", { name: "Billing" }).click();
  await expect.element(row(FIX)).not.toBeInTheDocument();
  expect(titlesIn("No priority")).toEqual([REVIEW]);
  await focusRow(REVIEW);
  await userEvent.keyboard("{Enter}");

  await expect.element(heading()).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("treeitem", { name: REVIEW, exact: true }))
    .toHaveAttribute("aria-selected", "true");
});

it("Keeps the project filter after a save empties it", async () => {
  await openTickets();
  await filter().click();
  await page.getByRole("option", { name: "Billing" }).click();
  await expect.element(row(FIX)).not.toBeInTheDocument();

  await openRowMenu(REVIEW);
  await page.getByRole("menuitem", { name: "Set status" }).click();
  await choice("Completed").click();

  await expect.element(page.getByText("No open tickets for this filter.")).toBeVisible();
  await expect.element(filter()).toHaveTextContent("Billing");
});

it("Moves among the filtered rows keep hidden tickets in their global place", async () => {
  const { store } = await openTickets({
    projects: [
      billing([{ title: "Second billing", ticketNumber: "PAY-2" }]),
      { name: "Customer portal", items: [{ title: "Hidden", ticketNumber: "WEB-1" }] },
    ],
  });
  await filter().click();
  await page.getByRole("option", { name: "Billing" }).click();
  await focusRow("Second billing");

  await altKey("ArrowUp");
  await expect.poll(() => titlesIn("No priority")).toEqual(["Second billing", REVIEW]);
  await filter().click();
  await page.getByRole("option", { name: "All projects" }).click();

  await expect.poll(() => titlesIn("No priority")).toEqual(["Second billing", REVIEW, "Hidden"]);
  expect(store.calls.filter((call) => call === "MoveTicket")).toHaveLength(1);
});

it("Row menus append to the new priority and remove a ticket marked done", async () => {
  await openTickets();

  await openRowMenu(REVIEW);
  await page.getByRole("menuitem", { name: "Set priority" }).click();
  await choice("Critical").click();
  await expect.poll(() => titlesIn("Critical")).toEqual([FIX, REVIEW]);
  await openRowMenu(REVIEW);
  await page.getByRole("menuitem", { name: "Set status" }).click();
  await choice("Completed").click();

  await expect.element(row(REVIEW)).not.toBeInTheDocument();
});

it("Ctrl+Shift+P pushes back the focused ticket's due date", async () => {
  const { store } = await openTickets();
  await focusRow(REVIEW);

  await userEvent.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");

  await expect.element(row(REVIEW).getByText("Nov 21, 2026", { exact: true })).toBeVisible();
  expect(store.calls.filter((call) => call === "PushBackOneDay")).toHaveLength(1);
});

it("Undo and redo replay a move on the board, and a refusal leaves it as it is", async () => {
  const { store } = await openTickets();
  await focusRow(REVIEW);
  await altKey("ArrowDown");
  await expect.poll(() => sectionOf(REVIEW)).toBe("Critical");

  await userEvent.keyboard("{Control>}z{/Control}");
  await expect.poll(() => sectionOf(REVIEW)).toBe("No priority");
  await userEvent.keyboard("{Control>}y{/Control}");
  await expect.poll(() => sectionOf(REVIEW)).toBe("Critical");
  store.historyRefusal = "This item changed since; can't undo.";
  await userEvent.keyboard("{Control>}z{/Control}");

  const dialog = page.getByRole("alertdialog", { name: "Undo and redo" });
  await expect.element(dialog).toHaveAccessibleDescription("This item changed since; can't undo.");
  await dialog.getByRole("button", { name: "OK" }).click();
  expect(sectionOf(REVIEW)).toBe("Critical");
});

it("Reports a refused move inline and reloads the board", async () => {
  const { store } = await openTickets();
  await focusRow(REVIEW);
  const portalId = store.summaries[1]!.project.id;
  store.completeItem(portalId, null, store.findItemByTitle(portalId, null, FIX)!.item.id);

  await altKey("ArrowDown");
  const error = page.getByTestId("tickets-error");
  await expect
    .element(error)
    .toHaveTextContent("The target ticket has moved or is no longer open.");
  await expect.element(row(FIX)).not.toBeInTheDocument();
  expect(sectionOf(REVIEW)).toBe("No priority");
  await altKey("ArrowDown");

  await expect.poll(() => sectionOf(REVIEW)).toBe("Critical");
  await expect.element(error).not.toBeInTheDocument();
});

it("Keeps an unsaved editor draft behind Tickets and asks once on Back after a move", async () => {
  await renderApp({ projects: [billing(), portal] });
  await openWorkspace("Billing");
  await page
    .getByRole("treeitem", { name: REVIEW, exact: true })
    .getByTestId("item-title")
    .first()
    .click();
  await userEvent.keyboard("{Enter}");
  const title = page.getByTestId("item-editor-title");
  await title.fill("Draft title");

  await shortcut();
  await back().click();
  await expect.element(title).toHaveValue("Draft title");
  await shortcut();
  await focusRow(FIX);
  await altKey("ArrowUp");
  await expect.poll(() => sectionOf(FIX)).toBe("No priority");
  await back().click();

  const dialog = page.getByRole("alertdialog", { name: "Unsaved changes" });
  await expect.element(dialog).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(heading()).toBeVisible();
  await back().click();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect.element(title).toHaveValue(REVIEW);
});

it("Shows a load failure with a retry", async () => {
  const { store } = await openTickets({
    configure: (seeded) => {
      seeded.tickets.loadFailure = "The ticket list is unavailable.";
    },
  });
  await expect.element(page.getByText("The ticket list is unavailable.")).toBeVisible();

  store.tickets.loadFailure = null;
  await page.getByTestId("retry-load").click();

  await expect.element(row(REVIEW)).toBeVisible();
});

it("Says when the filter has no open tickets", async () => {
  await openTickets({ projects: [{ name: "Empty" }] });

  await expect.element(page.getByText("No open tickets for this filter.")).toBeVisible();
  await expect.element(sectionHeader("No priority")).toBeVisible();
});

for (const theme of THEMES) {
  it(`Tickets and the row menu match the approved ${theme} images`, async () => {
    await openTickets({ configure: addSections });
    await expect.element(row("Update invoice preview")).toBeVisible();
    const shell = page.getByTestId("app-shell");

    await settleTheme(theme);
    await expect.element(shell).toMatchScreenshot(`tickets-${theme}`);
    await openRowMenu(REVIEW);
    await page.getByRole("menuitem", { name: "Set priority" }).hover();
    await expect.element(choice("Critical")).toBeVisible();
    await expect.element(shell).toMatchScreenshot(`tickets-row-menu-${theme}`);
  });
}
