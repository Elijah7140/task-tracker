import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { HOUR_HEIGHT, MORNING_OFFSET } from "../../src/calendar/calendar-metrics.js";
import { FAKE_LOOKUPS } from "../support/fake-area-items.js";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { chooseMenuCommand } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";

const LAYOUT_PROJECTS: ReadonlyArray<SeedProject> = [
  {
    name: "Billing",
    folders: [
      {
        name: "Invoices",
        items: [
          {
            title: "Audit ledger",
            dueDate: "2026-11-16",
            type: "Change",
            priority: "High",
            status: "In progress",
            urgency: "Overdue",
          },
          {
            title: "Client standup",
            scheduledStart: "2026-11-16T09:00:00",
            scheduledEnd: "2026-11-16T10:30:00",
            type: "Discussion",
            priority: "Medium",
            status: "In progress",
            urgency: "Approaching",
          },
          {
            title: "Overlapping triage",
            scheduledStart: "2026-11-16T09:30:00",
            scheduledEnd: "2026-11-16T10:30:00",
            type: "Error",
            priority: "Critical",
            urgency: "Imminent",
          },
          {
            title: "Touching handoff",
            scheduledStart: "2026-11-16T10:30:00",
            scheduledEnd: "2026-11-16T11:30:00",
            type: "Change",
            priority: "Low",
          },
          {
            title: "Quick ping",
            dueDate: "2026-11-16",
            dueTime: "12:00:00",
            urgency: "Approaching",
          },
          {
            title: "Overnight deploy",
            scheduledStart: "2026-11-17T22:30:00",
            scheduledEnd: "2026-11-18T01:30:00",
            type: "Change",
            priority: "High",
          },
          { title: "Late cutoff", dueDate: "2026-11-17", dueTime: "23:59:00", urgency: "Imminent" },
          {
            title: "Done report",
            dueDate: "2026-11-19",
            completedAtUtc: "2026-11-15T10:00:00Z",
            urgency: "Overdue",
          },
          {
            title: "Stand-up",
            scheduledStart: "2026-11-20T08:00:00",
            scheduledEnd: "2026-11-20T08:10:00",
          },
          {
            title: "Sync",
            scheduledStart: "2026-11-20T08:15:00",
            scheduledEnd: "2026-11-20T08:30:00",
          },
          {
            title: "Review",
            scheduledStart: "2026-11-20T08:30:00",
            scheduledEnd: "2026-11-20T08:50:00",
          },
          {
            title: "Ping",
            scheduledStart: "2026-11-20T08:40:00",
            scheduledEnd: "2026-11-20T08:40:00",
          },
          {
            title: "Planning",
            scheduledStart: "2026-11-20T09:00:00",
            scheduledEnd: "2026-11-20T10:00:00",
          },
        ],
      },
    ],
  },
  {
    name: "Operations",
    items: [
      {
        title: "Rotate keys",
        dueDate: "2026-11-18",
        type: "Change",
        priority: "Critical",
        urgency: "Approaching",
      },
    ],
  },
];

const DRAFT_PROJECTS: ReadonlyArray<SeedProject> = [
  {
    name: "Billing",
    items: [
      { title: "Review invoice", dueDate: "2026-11-16" },
      { title: "Parent task", children: [{ title: "Child step", dueDate: "2026-11-18" }] },
      {
        title: "Closed parent",
        completedAtUtc: "2026-11-10T10:00:00Z",
        children: [
          { title: "Closed child", dueDate: "2026-11-19", completedAtUtc: "2026-11-10T10:00:00Z" },
        ],
      },
    ],
    folders: [{ name: "Invoices", items: [{ title: "Pay vendor", dueDate: "2026-11-17" }] }],
  },
];

const shortcut = (key: string) => userEvent.keyboard(`{Control>}{Shift>}${key}{/Shift}{/Control}`);
const calendar = () => page.getByTestId("calendar-page");
const title = () => page.getByTestId("calendar-title");
const escapeRegExp = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An entry by its title; its accessible name continues with timing and urgency. */
const entry = (name: string) =>
  page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}(,|$)`) });
const more = (day: string) =>
  page.getByRole("button", { name: new RegExp(`^\\+\\d+ more on ${day}`) });
const home = () => page.getByRole("heading", { name: "Projects", exact: true, level: 1 });
const item = (name: string) => page.getByRole("treeitem", { name, exact: true });
const draftPrompt = () => page.getByRole("alertdialog", { name: "Unsaved changes" });

async function openFromHome(projects = LAYOUT_PROJECTS) {
  const app = await renderApp({ projects });
  await expect.element(home()).toBeVisible();
  await shortcut("c");
  await expect.element(title()).toHaveTextContent("November 2026");
  await expect.element(page.getByTestId("calendar-entry").first()).toBeVisible();
  return app;
}

async function focusEntry(name: string) {
  await expect.element(entry(name).first()).toBeVisible();
  (entry(name).first().element() as HTMLElement).focus();
}

async function openWeek(projects = LAYOUT_PROJECTS) {
  const app = await openFromHome(projects);
  await shortcut("w");
  await expect.element(title()).toHaveTextContent("Nov 15 – 21, 2026");
  await expect.element(page.getByTestId("calendar-entry").first()).toBeVisible();
  return app;
}

async function openDraftWorkspace() {
  const app = await renderApp({ projects: DRAFT_PROJECTS });
  await page.getByRole("article", { name: "Billing" }).click();
  await item("Review invoice").getByTestId("item-title").first().click();
  await userEvent.keyboard("{Enter}");
  await page.getByTestId("item-editor-title").fill("Review invoice edited");
  await shortcut("c");
  await expect.element(calendar()).toBeVisible();
  return app;
}

function rect(name: string) {
  return entry(name).element().getBoundingClientRect();
}

/** The day column's box; `width` is its inner width, which entries share. */
function columnRect(name: string) {
  const column = entry(name).element().closest('[data-testid="calendar-time-column"]')!;
  const { top, bottom } = column.getBoundingClientRect();
  return { top, bottom, width: column.clientWidth };
}

describe("opening and leaving", () => {
  it("Opens with Ctrl+Shift+C and returns Home on Escape", async () => {
    await openFromHome();

    await expect.element(page.getByTestId("calendar-scope")).not.toBeInTheDocument();
    await expect.element(page.getByTestId("calendar-month-cell").nth(41)).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(calendar()).not.toBeInTheDocument();
    await expect.element(home()).toBeVisible();
  });

  it.each([
    ["Ctrl", "{Control>}c{/Control}"],
    ["Shift", "{Shift>}c{/Shift}"],
    ["no modifier", "c"],
    ["Ctrl+Shift+Alt", "{Control>}{Shift>}{Alt>}c{/Alt}{/Shift}{/Control}"],
  ])("Ignores the calendar shortcut with %s", async (_label, keys) => {
    await renderApp({ projects: LAYOUT_PROJECTS });
    await expect.element(home()).toBeVisible();

    await userEvent.keyboard(keys);

    await expect.element(calendar()).not.toBeInTheDocument();
  });

  it("Does not open a second calendar for a second shortcut", async () => {
    await openFromHome();
    await shortcut("w");

    await shortcut("c");

    await expect.element(page.getByTestId("calendar-week-grid")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(home()).toBeVisible();
  });

  it.each([
    ["Ctrl+PageDown", "{Control>}{PageDown}{/Control}"],
    ["Shift+PageUp", "{Shift>}{PageUp}{/Shift}"],
    ["Shift+Escape", "{Shift>}{Escape}{/Shift}"],
    ["Ctrl+Escape", "{Control>}{Escape}{/Control}"],
  ])("Does nothing for %s", async (_label, keys) => {
    await openFromHome();

    await userEvent.keyboard(keys);

    await expect.element(calendar()).toBeVisible();
    await expect.element(title()).toHaveTextContent("November 2026");
  });

  it("Starts a workspace calendar in project scope and Back restores the workspace", async () => {
    await renderApp({ projects: LAYOUT_PROJECTS });
    await page.getByRole("article", { name: "Billing" }).click();
    await page.getByRole("treeitem", { name: "Invoices" }).click();
    await expect.element(item("Audit ledger")).toBeVisible();

    await chooseMenuCommand("view", "menu-calendar");
    await expect.element(page.getByTestId("calendar-scope")).toHaveTextContent("This project");
    await shortcut("w");
    await page.getByTestId("calendar-back").click();

    await expect.element(calendar()).not.toBeInTheDocument();
    await expect.element(item("Audit ledger")).toBeVisible();
  });

  it("Never stacks with Trash and keeps the original page as the return target", async () => {
    await renderApp({ projects: LAYOUT_PROJECTS });
    await page.getByRole("article", { name: "Billing" }).click();
    await chooseMenuCommand("view", "menu-calendar");

    await shortcut("t");
    await expect.element(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
    await expect.element(calendar()).not.toBeInTheDocument();
    await shortcut("c");
    await expect.element(page.getByTestId("calendar-scope")).toHaveTextContent("This project");
    await page.getByTestId("calendar-back").click();

    await expect.element(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  });

  it("Opens Search from Calendar and Back restores the workspace draft", async () => {
    await openDraftWorkspace();

    await userEvent.keyboard("{Control>}f{/Control}");
    await expect
      .element(page.getByRole("combobox", { name: "Search scope" }))
      .toHaveTextContent("This project");
    await expect.element(calendar()).not.toBeInTheDocument();
    await page.getByTestId("search-back").click();

    await expect.element(page.getByTestId("search-back")).not.toBeInTheDocument();
    await expect.element(calendar()).not.toBeInTheDocument();
    await expect
      .element(page.getByTestId("item-editor-title"))
      .toHaveValue("Review invoice edited");
  });
});

describe("periods and views", () => {
  it("Changes the period with the buttons and switches to Week", async () => {
    await openFromHome();

    await page.getByTestId("calendar-next").click();
    await expect.element(title()).toHaveTextContent("December 2026");
    await page.getByTestId("calendar-previous").click();
    await expect.element(title()).toHaveTextContent("November 2026");
    await page.getByTestId("calendar-next").click();
    await page.getByTestId("calendar-today").click();
    await expect.element(title()).toHaveTextContent("November 2026");
    await page.getByTestId("calendar-view-week").click();

    await expect.element(title()).toHaveTextContent("Nov 15 – 21, 2026");
    await expect
      .element(page.getByTestId("calendar-view-week"))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("Changes the period and view with shortcuts", async () => {
    await openFromHome();

    await userEvent.keyboard("{PageDown}");
    await expect.element(title()).toHaveTextContent("December 2026");
    await userEvent.keyboard("{PageUp}");
    await expect.element(title()).toHaveTextContent("November 2026");
    await shortcut("w");
    await expect.element(page.getByTestId("calendar-week-grid")).toBeVisible();
    await shortcut("m");

    await expect.element(page.getByTestId("calendar-month-grid")).toBeVisible();
  });

  it.each([
    ["month", "December 2026", "November 2026"],
    ["week", "Nov 22 – 28, 2026", "Nov 15 – 21, 2026"],
  ])(
    "Changes the %s with PageDown and PageUp while an entry has focus",
    async (view, next, back) => {
      await openFromHome();
      if (view === "week") {
        await shortcut("w");
      }
      await focusEntry("Audit ledger");

      await userEvent.keyboard("{PageDown}");
      await expect.element(title()).toHaveTextContent(next);
      await userEvent.keyboard("{PageUp}");

      await expect.element(title()).toHaveTextContent(back);
    },
  );

  it("Opens the clicked day in Week from +N more, scrolled to 07:00", async () => {
    await openFromHome();
    const moreButton = more("Monday, November 16, 2026");
    await expect.element(moreButton).toHaveTextContent("+2 more");

    await moreButton.click();

    await expect.element(title()).toHaveTextContent("Nov 15 – 21, 2026");
    const monday = page.getByRole("group", {
      name: "Monday, November 16, 2026, today",
      exact: true,
    });
    await expect.element(monday).toBeVisible();
    expect(page.getByTestId("calendar-week-day-header").elements()).toHaveLength(7);
    expect(monday.getByTestId("calendar-entry").elements()).toHaveLength(4);
    expect(page.getByTestId("calendar-week-scroll").element().scrollTop).toBe(MORNING_OFFSET);
  });

  it("Moves by month from the first day so short months are not skipped", async () => {
    await openFromHome();

    for (const month of ["December 2026", "January 2027", "February 2027", "March 2027"]) {
      await page.getByTestId("calendar-next").click();
      await expect.element(title()).toHaveTextContent(month);
    }
    const cells = page.getByTestId("calendar-month-cell");

    await expect.element(cells.first()).toHaveAttribute("data-date", "2027-02-28");
    await expect.element(cells.nth(1)).not.toHaveAttribute("data-outside-month");
  });
});

describe("filters", () => {
  it("Filters by project scope and Include completed", async () => {
    await renderApp({ projects: LAYOUT_PROJECTS });
    await page.getByRole("article", { name: "Billing" }).click();
    await chooseMenuCommand("view", "menu-calendar");
    await expect.element(entry("Audit ledger")).toBeVisible();
    await expect.element(entry("Rotate keys")).not.toBeInTheDocument();
    await expect.element(entry("✓ Done report")).not.toBeInTheDocument();

    await page.getByTestId("calendar-include-completed").click();
    await expect.element(entry("✓ Done report")).toBeVisible();
    await page.getByTestId("calendar-scope").click();
    await page.getByRole("option", { name: "All projects" }).click();

    await expect.element(entry("Rotate keys")).toBeVisible();
    await expect.element(entry("✓ Done report")).toHaveClass(/opacity-55/);
  });

  it("Shows a load failure with a retry", async () => {
    const { store } = await renderApp({ projects: LAYOUT_PROJECTS });
    store.calendar.loadFailure = "The calendar could not load.";
    await shortcut("c");
    await expect.element(page.getByTestId("calendar-load-failure")).toBeVisible();
    store.calendar.loadFailure = null;

    await page.getByTestId("calendar-load-failure").getByRole("button").click();

    await expect.element(entry("Audit ledger")).toBeVisible();
  });
});

describe("entry display", () => {
  it("Shows an overdue label and bold title in month and week views", async () => {
    await openFromHome();
    const ledger = entry("Audit ledger");
    await expect.element(ledger.getByTestId("calendar-entry-urgency")).toHaveTextContent("Overdue");
    await expect.element(ledger.getByText("Audit ledger")).toHaveStyle({ fontWeight: "600" });

    await shortcut("w");

    await expect.element(ledger.getByTestId("calendar-entry-urgency")).toHaveTextContent("Overdue");
    await expect.element(ledger.getByText("Audit ledger")).toHaveStyle({ fontWeight: "600" });
    await expect.element(ledger).toHaveAttribute("title", "Change · High · In progress");
  });

  it("Shows every all-day entry of the week inside its column above the time grid", async () => {
    const items = [1, 2, 3, 4].map((number) => ({
      title: `Task ${number}`,
      dueDate: "2026-11-13",
    }));
    await openFromHome([{ name: "Billing", items }]);
    await page.getByTestId("calendar-more-button").click();
    await expect.element(page.getByTestId("calendar-week-grid")).toBeVisible();

    const buttons = page.getByTestId("calendar-entry").elements();
    const gridTop = page.getByTestId("calendar-week-scroll").element().getBoundingClientRect().top;
    const cell = page.getByRole("group", { name: "Friday, November 13, 2026, all day" });
    const cellRect = cell.element().getBoundingClientRect();

    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      const bounds = button.getBoundingClientRect();
      expect(bounds.bottom).toBeLessThanOrEqual(gridTop + 0.5);
      expect(bounds.width).toBeLessThanOrEqual(cellRect.width + 0.5);
    }
  });

  it("Splits only overlapping blocks and draws them at their real height", async () => {
    await openWeek();

    expect(rect("Client standup").width).toBeCloseTo(rect("Overlapping triage").width, 0);
    expect(rect("Client standup").width).toBeLessThan(columnRect("Client standup").width / 2);
    expect(rect("Touching handoff").width).toBeCloseTo(columnRect("Touching handoff").width - 2, 0);
    expect(rect("Client standup").height).toBeCloseTo(1.5 * HOUR_HEIGHT, 0);
    await expect.element(entry("Quick ping")).toHaveAttribute("data-compact", "true");
    await expect.element(entry("Client standup")).toHaveAttribute("data-compact", "false");
    expect(entry("Overnight deploy").elements()).toHaveLength(2);
  });

  it("Draws adjacent half-hour blocks at full width and real height", async () => {
    const items = [
      {
        title: "First half",
        scheduledStart: "2026-11-17T09:00:00",
        scheduledEnd: "2026-11-17T09:30:00",
      },
      {
        title: "Second half",
        scheduledStart: "2026-11-17T09:30:00",
        scheduledEnd: "2026-11-17T10:00:00",
      },
      { title: "No end", scheduledStart: "2026-11-17T11:00:00" },
    ];
    await openWeek([{ name: "Billing", items }]);
    const halfHour = HOUR_HEIGHT / 2;

    const first = rect("First half");
    const second = rect("Second half");

    expect(first.height).toBeCloseTo(halfHour, 0);
    expect(second.height).toBeCloseTo(halfHour, 0);
    expect(rect("No end").height).toBeCloseTo(halfHour, 0);
    expect(first.width).toBeCloseTo(columnRect("First half").width - 2, 0);
    expect(second.width).toBeCloseTo(first.width, 0);
    expect(second.top).toBeCloseTo(first.top + halfHour, 0);
  });

  it("Keeps a 23:59 marker and its title inside the day column", async () => {
    await openWeek();
    const scroll = page.getByTestId("calendar-week-scroll").element();
    scroll.scrollTop = scroll.scrollHeight;

    const marker = rect("Late cutoff");
    const column = columnRect("Late cutoff");
    const text = entry("Late cutoff").getByText("Late cutoff").element().getBoundingClientRect();

    expect(marker.top).toBeGreaterThanOrEqual(column.top - 0.5);
    expect(marker.bottom).toBeLessThanOrEqual(column.bottom + 0.5);
    expect(marker.height).toBeCloseTo(HOUR_HEIGHT / 2, 0);
    expect(text.bottom).toBeLessThanOrEqual(column.bottom + 0.5);
  });

  it("Refreshes urgency and today each minute from the Effect Clock", async () => {
    const testClock = createTestClock();
    const seed = [{ name: "Billing", items: [{ title: "Deadline", dueDate: "2026-11-16" }] }];
    const { store } = await renderApp({
      projects: seed.map((project) => ({
        ...project,
        items: project.items.map((value) => ({ ...value, urgency: "Approaching" as const })),
      })),
      clock: testClock.clock,
    });
    await chooseMenuCommand("view", "menu-calendar");
    await expect
      .element(page.getByTestId("calendar-entry-urgency"))
      .toHaveTextContent("Approaching");

    const billingId = store.summaries[0]!.project.id;
    store.setItems(billingId, null, [
      { title: "Deadline", dueDate: "2026-11-16", urgency: "Overdue" },
    ]);
    store.calendar.today = "2026-11-17";
    await testClock.advance("1 minute");

    await expect.element(page.getByTestId("calendar-entry-urgency")).toHaveTextContent("Overdue");
    await expect
      .element(page.getByRole("group", { name: "Tuesday, November 17, 2026, today" }))
      .toHaveAttribute("data-today", "true");
  });
});

describe("keyboard navigation", () => {
  it("Moves focus between entries with the arrow keys, Home and End", async () => {
    await openFromHome();
    await focusEntry("Audit ledger");

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(entry("Client standup")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(more("Monday")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(entry("Late cutoff")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(entry("Client standup")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await expect.element(entry("Audit ledger")).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(more("Friday")).toHaveFocus();
    await userEvent.keyboard("{Home}");

    await expect.element(entry("Audit ledger")).toHaveFocus();
    await expect.element(title()).toHaveTextContent("November 2026");
  });

  it("Moves between the all-day row and timed entries of a week day", async () => {
    await openWeek();
    await focusEntry("Audit ledger");

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(entry("Client standup")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");

    await expect.element(entry("Late cutoff")).toHaveFocus();
  });

  it("Names entries with their timing and urgency, and days with their date", async () => {
    await openFromHome();

    await expect
      .element(
        page.getByRole("button", { name: "Audit ledger, due all day, Overdue", exact: true }),
      )
      .toBeVisible();
    await expect
      .element(
        page.getByRole("button", {
          name: "Client standup, scheduled 09:00 to 10:30, Approaching",
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(page.getByRole("group", { name: "Monday, November 16, 2026, today", exact: true }))
      .toHaveAttribute("data-today", "true");
  });
});

describe("entry activation", () => {
  it("Opens the entry's folder with the item selected by click or Enter", async () => {
    await renderApp({ projects: DRAFT_PROJECTS });
    await expect.element(home()).toBeVisible();
    await shortcut("c");

    await entry("Pay vendor").click();
    await expect.element(calendar()).not.toBeInTheDocument();
    await expect.element(item("Pay vendor")).toHaveAttribute("aria-selected", "true");
    await shortcut("c");
    await focusEntry("Review invoice");
    await userEvent.keyboard("{Enter}");

    await expect.element(calendar()).not.toBeInTheDocument();
    await expect.element(item("Review invoice")).toHaveAttribute("aria-selected", "true");
  });

  it("Expands the parents of an opened sub-item, including finished branches", async () => {
    await openFromHome(DRAFT_PROJECTS);

    await entry("Child step").click();
    await expect.element(item("Child step")).toHaveAttribute("aria-selected", "true");
    await shortcut("c");
    await page.getByTestId("calendar-include-completed").click();
    await entry("✓ Closed child").click();

    await expect.element(item("Closed child")).toBeVisible();
    await expect.element(item("Closed child")).toHaveAttribute("aria-selected", "true");
  });

  it("Reloads and reports an entry whose item was deleted", async () => {
    const { store } = await openFromHome(DRAFT_PROJECTS);
    const billing = store.summaries[0]!.project.id;
    store.deleteItem(
      billing,
      null,
      store.findItemByTitle(billing, null, "Review invoice")!.item.id,
    );

    await entry("Review invoice").click();

    await expect
      .element(page.getByTestId("calendar-error"))
      .toHaveTextContent("This item no longer exists");
    await expect.element(entry("Review invoice")).not.toBeInTheDocument();
    await expect.element(calendar()).toBeVisible();
  });

  it.each([
    ["Save", "Review invoice edited"],
    ["Discard", "Review invoice"],
  ])(
    "Resolves one unsaved-changes prompt with %s before the entry opens",
    async (choice, expected) => {
      const { store } = await openDraftWorkspace();

      await entry("Pay vendor").click();
      await draftPrompt().getByRole("button", { name: choice }).click();

      await expect.element(draftPrompt()).not.toBeInTheDocument();
      await expect.element(calendar()).not.toBeInTheDocument();
      await expect.element(item("Pay vendor")).toHaveAttribute("aria-selected", "true");
      const billing = store.summaries[0]!.project.id;
      expect(store.findItemByTitle(billing, null, expected)).toBeDefined();
    },
  );

  it("Keeps the calendar and the draft when the prompt is cancelled", async () => {
    await openDraftWorkspace();

    await entry("Pay vendor").click();
    await expect.element(draftPrompt()).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(draftPrompt()).not.toBeInTheDocument();
    await expect.element(calendar()).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(calendar()).not.toBeInTheDocument();
    await expect
      .element(page.getByTestId("item-editor-title"))
      .toHaveValue("Review invoice edited");
  });

  it("Drops an activation still pending when the calendar is left", async () => {
    const { store } = await openDraftWorkspace();
    const release = store.hold("LocateCalendarItem");

    await entry("Pay vendor").click();
    await page.getByTestId("calendar-back").click();
    await expect.element(calendar()).not.toBeInTheDocument();
    release();
    await expect
      .poll(() => store.calls.filter((call) => call === "LocateCalendarItem"))
      .toHaveLength(1);

    await expect.element(draftPrompt()).not.toBeInTheDocument();
    await expect
      .element(page.getByTestId("item-editor-title"))
      .toHaveValue("Review invoice edited");
    await expect.element(item("Pay vendor")).not.toBeInTheDocument();
  });

  it("Ignores a second activation while one is pending", async () => {
    const { store } = await openFromHome(DRAFT_PROJECTS);
    const release = store.hold("LocateCalendarItem");

    await entry("Pay vendor").click();
    await entry("Review invoice").click();
    release();

    await expect.element(item("Pay vendor")).toHaveAttribute("aria-selected", "true");
    expect(store.calls.filter((call) => call === "LocateCalendarItem")).toHaveLength(1);
  });
});

describe("focus", () => {
  it("Focuses the first entry after PageDown or PageUp, else Previous or Next", async () => {
    await openFromHome();
    await focusEntry("Late cutoff");

    await userEvent.keyboard("{PageDown}");
    await expect.element(title()).toHaveTextContent("December 2026");
    await expect.element(page.getByTestId("calendar-next")).toHaveFocus();
    await userEvent.keyboard("{PageUp}");
    await expect.element(title()).toHaveTextContent("November 2026");
    await expect.element(entry("Audit ledger")).toHaveFocus();
    await userEvent.keyboard("{PageUp}");

    await expect.element(title()).toHaveTextContent("October 2026");
    await expect.element(page.getByTestId("calendar-previous")).toHaveFocus();
  });

  it("Focuses the opened day's first entry after +N more", async () => {
    await openFromHome();
    const moreButton = more("Friday, November 20, 2026");
    (moreButton.element() as HTMLElement).focus();

    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByTestId("calendar-week-grid")).toBeVisible();
    await expect.element(entry("Stand-up")).toHaveFocus();
  });
});

describe("row menu", () => {
  const choice = (name: string) => page.getByRole("menuitemradio", { name, exact: true });

  async function setStatusByPointer(name: string, status: string) {
    await entry(name).first().click({ button: "right" });
    await page.getByTestId("item-menu-set-status").click();
    await choice(status).click();
  }

  it("Sets the status from the pointer menu and shows the reloaded value checked", async () => {
    const { store } = await openFromHome();
    const loads = store.calls.filter((call) => call === "LoadCalendar").length;

    await setStatusByPointer("Rotate keys", "Testing");

    await expect
      .poll(() => store.calls.filter((call) => call === "LoadCalendar").length)
      .toBeGreaterThan(loads);
    const operations = store.summaries[1]!.project.id;
    expect(store.findItemByTitle(operations, null, "Rotate keys")?.item.statusId).not.toBeNull();
    await entry("Rotate keys").first().click({ button: "right" });
    await page.getByTestId("item-menu-set-status").click();
    await expect.element(choice("Testing")).toHaveAttribute("aria-checked", "true");
  });

  it.each([
    ["Shift+F10", "{Shift>}{F10}{/Shift}"],
    ["the Menu key", "{ContextMenu}"],
  ])("Sets the priority from the keyboard menu opened with %s", async (_label, keys) => {
    const { store } = await openFromHome();
    // A pointer left over the menu's position would highlight a row on hover.
    await userEvent.hover(title());
    await focusEntry("Rotate keys");

    await userEvent.keyboard(keys);
    const menu = page.getByTestId("calendar-entry-menu");
    await expect.element(menu).toBeVisible();
    await expect.poll(() => menu.element().contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByTestId("item-menu-set-status")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(page.getByTestId("item-menu-set-priority")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(choice("None")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(choice("Critical")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(choice("High")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(menu).not.toBeInTheDocument();
    const operations = store.summaries[1]!.project.id;
    await expect
      .poll(() => store.findItemByTitle(operations, null, "Rotate keys")?.item.priorityLevelId)
      .toBe(FAKE_LOOKUPS.priorityLevels.find((level) => level.label === "High")?.id);
    await expect.element(entry("Rotate keys")).toHaveFocus();
  });

  it("Marks the page behind out of date so Back asks about its draft", async () => {
    await openDraftWorkspace();

    await setStatusByPointer("Pay vendor", "Testing");
    await expect.element(page.getByTestId("calendar-entry-menu")).not.toBeInTheDocument();
    await page.getByTestId("calendar-back").click();

    await expect.element(draftPrompt()).toBeVisible();
  });
});

describe("push back one day", () => {
  const pushBackItem = () => page.getByRole("menuitem", { name: "Push back one day" });
  const pushBacks = (store: { readonly calls: ReadonlyArray<string> }) =>
    store.calls.filter((call) => call === "PushBackOneDay").length;

  it("Pushes back the focused entry with Ctrl+Shift+P and keeps it focused on its new day", async () => {
    const { store } = await openFromHome();
    const operations = store.summaries[1]!.project.id;
    await focusEntry("Rotate keys");

    await shortcut("p");

    await expect
      .poll(() => store.findItemByTitle(operations, null, "Rotate keys")?.item.dueDate)
      .toBe("2026-11-19");
    await expect.element(entry("Rotate keys")).toHaveAttribute("data-date", "2026-11-19");
    await expect.element(entry("Rotate keys")).toHaveFocus();
    expect(pushBacks(store)).toBe(1);
  });

  it("Moves both ends of a block from the pointer menu", async () => {
    const { store } = await openWeek();
    const billing = store.summaries[0]!.project.id;
    const invoices = store.folders.find((folder) => folder.name === "Invoices")!.id;

    await entry("Client standup").first().click({ button: "right" });
    await pushBackItem().click();

    await expect
      .poll(() => store.findItemByTitle(billing, invoices, "Client standup")?.item.scheduledStart)
      .toBe("2026-11-17T09:00:00");
    expect(store.findItemByTitle(billing, invoices, "Client standup")?.item.scheduledEnd).toBe(
      "2026-11-17T10:30:00",
    );
    await expect.element(entry("Client standup")).toHaveAttribute("data-date", "2026-11-17");
  });

  it("Shows the action disabled for a completed entry and ignores the shortcut", async () => {
    const { store } = await openFromHome();
    await page.getByTestId("calendar-include-completed").click();
    await expect.element(entry("✓ Done report")).toBeVisible();

    await focusEntry("✓ Done report");
    await shortcut("p");
    await entry("✓ Done report").click({ button: "right" });

    await expect.element(pushBackItem()).toHaveAttribute("aria-disabled", "true");
    await expect
      .element(pushBackItem())
      .toHaveAccessibleDescription("Completed items cannot be pushed back.");
    expect(pushBacks(store)).toBe(0);
  });

  it("Back waits for a running push back, then asks about the draft behind", async () => {
    const { store } = await openDraftWorkspace();
    const release = store.hold("PushBackOneDay");
    await focusEntry("Pay vendor");

    await shortcut("p");
    await expect.poll(() => pushBacks(store)).toBe(1);
    await page.getByTestId("calendar-back").click();

    await expect.element(calendar()).toBeVisible();
    await expect.element(draftPrompt()).not.toBeInTheDocument();
    release();
    await expect.element(draftPrompt()).toBeVisible();
  });
});

describe("row menu baselines", () => {
  for (const theme of THEMES) {
    it(`Matches the reviewed entry menu baseline in ${theme} mode`, async () => {
      await openFromHome();
      await settleTheme(theme);

      await entry("Rotate keys").first().click({ button: "right" });

      await expect.element(page.getByTestId("calendar-entry-menu")).toBeVisible();
      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`calendar-entry-menu-${theme}`);
    });
  }
});

describe("baselines", () => {
  for (const theme of THEMES) {
    it(`Matches the month, week, late-night and narrow baselines in ${theme} mode`, async () => {
      await openFromHome();
      const shot = async (name: string) => {
        await settleTheme(theme);
        await expect.element(calendar()).toMatchScreenshot(`${name}-${theme}`);
      };

      await shot("calendar-month");
      await shortcut("w");
      await expect.element(page.getByTestId("calendar-week-grid")).toBeVisible();
      await shot("calendar-week");
      const scroll = page.getByTestId("calendar-week-scroll").element();
      scroll.scrollTop = scroll.scrollHeight;
      await shot("calendar-week-late-night");

      const { innerWidth, innerHeight } = window;
      try {
        await page.viewport(900, 700);
        await shot("calendar-week-narrow");
        await shortcut("m");
        await expect.element(page.getByTestId("calendar-month-grid")).toBeVisible();
        await shot("calendar-narrow");
      } finally {
        await page.viewport(innerWidth, innerHeight);
      }
    });
  }
});
