import type {} from "@vitest/browser-playwright";
import { describe, expect, it, onTestFinished } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { type RenderAppOptions, renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const HIGH_ID = "019A0000-0000-7000-8000-000000002001";

const item = (name: string) => page.getByRole("treeitem", { name, exact: true });
const surface = (name: string) => item(name).getByTestId("item-row").first();
const header = (title: string) =>
  page.getByTestId("priority-group-header").filter({ hasText: title }).first();
const section = (title: string) => page.getByRole("group", { name: title, exact: true });
const historyStatus = () => page.getByTestId("history-status");

/** The section titles in display order. */
const sectionTitles = () =>
  page
    .getByTestId("priority-group-header")
    .elements()
    .map((element) => element.querySelector("h2")?.textContent);

/** The card titles of one section in reading order. */
const cardTitles = (title: string) =>
  section(title)
    .getByTestId("item-card-header")
    .elements()
    .map((element) => element.querySelector("[data-testid='item-title']")?.textContent);

/** Cards take drops along their width on the header line; rows along their height. */
const CARD_HEADER_OFFSET = 16;

function point(element: Element, fraction = 0.5) {
  const rect = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  const isCard = element.getAttribute("data-item-card") === "true";
  return {
    x: Math.round(
      (frame?.left ?? 0) + rect.left + (isCard ? rect.width * fraction : rect.width / 2),
    ),
    y: Math.round(
      (frame?.top ?? 0) + rect.top + (isCard ? CARD_HEADER_OFFSET : rect.height * fraction),
    ),
  };
}

type Point = ReturnType<typeof point>;

const mouse = (
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  at: Point,
  buttons: number,
  button: "left" | "none" = "none",
) => cdp().send("Input.dispatchMouseEvent", { ...at, type, buttons, button, clickCount: 1 });

/** Presses on the source and moves past the drag threshold to the target, without releasing. */
async function beginDrag(source: Element, target: Point) {
  const from = point(source);
  await mouse("mouseMoved", from, 0);
  await mouse("mousePressed", from, 1, "left");
  onTestFinished(async () => {
    await mouse("mouseReleased", target, 0, "left");
  });
  await mouse("mouseMoved", { x: from.x + 8, y: from.y }, 1);
  await mouse("mouseMoved", target, 1);
}

const release = (at: Point) => mouse("mouseReleased", at, 0, "left");

const moves = (store: FakeProjectStore) =>
  store.calls.filter((call) => call === "MoveItemToPriorityGroup").length;

/**
 * Top-level order: High first, Plain card, High second, Done card. The grid shows
 * "No priority" [Plain card] and "High" [High first, High second], then Completed (1).
 */
const GRID_PROJECT: SeedProject = {
  name: "Card Grid",
  items: [
    { title: "High first", priority: "High", description: "Investigate the query plan." },
    { title: "Plain card", children: [{ title: "Nested task" }] },
    { title: "High second", priority: "High" },
    { title: "Done card", completedAtUtc: "2026-11-12T10:00:00Z" },
  ],
};

const steps = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ title: `Step ${index + 1}` }));

/**
 * The legacy card grid snapshot: two "No priority" cards, five "High" cards that wrap, and one
 * "Low" card, with descriptions, tickets, dates and sub-items of different lengths.
 */
const SNAPSHOT_PROJECT: SeedProject = {
  name: "Billing DB",
  items: [
    {
      title: "Draft the Q1 roadmap",
      description: "Collect the requests from the owner review.",
      dueDate: "2026-11-25",
    },
    { title: "Tidy the test fixtures", dueDate: "2026-11-25", children: steps(2) },
    {
      title: "Add index to Invoice.CustomerId",
      type: "Change",
      priority: "High",
      ticketNumber: "DB-161",
      dueDate: "2026-11-25",
      description: "Slow invoice lookups on the customer page. Check the plan before and after.",
      children: steps(3),
    },
    { title: "Review migration", priority: "High", ticketNumber: "DB-146", dueDate: "2026-11-25" },
    {
      title: "Fix rounding in tax totals",
      type: "Error",
      priority: "High",
      ticketNumber: "DB-156",
      dueDate: "2026-11-14",
      urgency: "Overdue",
      status: "In progress",
      description: "Totals are off by a cent when a discount applies.",
      children: steps(1),
    },
    {
      title: "Prepare release notes",
      priority: "High",
      ticketNumber: "DB-151",
      dueDate: "2026-11-25",
      children: [
        ...steps(5),
        { title: "Publish the notes", completedAtUtc: "2026-11-12T09:00:00Z" },
      ],
    },
    {
      title: "Archive old audit rows",
      priority: "High",
      ticketNumber: "DB-152",
      dueDate: "2026-11-25",
    },
    {
      title: "Rename the reporting schema",
      priority: "Low",
      ticketNumber: "DB-157",
      dueDate: "2026-11-16",
      urgency: "Approaching",
      children: steps(1),
    },
    { title: "Retire the nightly export", completedAtUtc: "2026-11-12T10:00:00Z" },
  ],
};

async function openProject(
  seed: SeedProject = GRID_PROJECT,
  configure?: RenderAppOptions["configure"],
) {
  const options = configure === undefined ? { projects: [seed] } : { projects: [seed], configure };
  const app = await renderApp(options);
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  return { ...app, projectId };
}

const numbered = (id: string, number: number, sortOrder: number) => ({
  id,
  name: "",
  number,
  label: String(number),
  colorKey: null,
  isBuiltIn: false,
  isArchived: false,
  sortOrder,
});

describe("Workspace priority card grid", () => {
  it("Orders sections by level sort order (1, 7, 2), counts cards and shows archived levels in use", async () => {
    const ids = {
      one: "019A0000-0000-7000-8000-000000000902",
      seven: "019A0000-0000-7000-8000-000000000903",
      two: "019A0000-0000-7000-8000-000000000904",
      legacy: "019A0000-0000-7000-8000-000000000901",
      unused: "019A0000-0000-7000-8000-000000000905",
    };
    const legacyLevel = {
      ...numbered("", 0, 13),
      name: "Legacy",
      number: null,
      label: "Legacy",
      isArchived: true,
    };
    const seed: SeedProject = {
      name: "Order Test",
      items: ["Two", "Seven", "One", "Plain", "Legacy", "Second plain"].map((title) => ({
        title,
      })),
    };

    await openProject(seed, (store) => {
      store.extraLookups.priorityLevels.push(
        numbered(ids.one, 1, 10),
        numbered(ids.seven, 7, 11),
        numbered(ids.two, 2, 12),
        { ...legacyLevel, id: ids.legacy },
        { ...numbered(ids.unused, 9, 14), isArchived: true },
      );
      const projectId = store.summaries[0]!.project.id;
      const assign = (title: string, priorityLevelId: string) =>
        store.patchItem(store.findItemByTitle(projectId, null, title)!.item.id, {
          priorityLevelId,
        });
      assign("One", ids.one);
      assign("Seven", ids.seven);
      assign("Two", ids.two);
      assign("Legacy", ids.legacy);
    });

    expect(sectionTitles()).toEqual(["No priority", "1", "7", "2", "Legacy"]);
    await expect
      .element(header("No priority").getByTestId("priority-group-count"))
      .toHaveTextContent("2 items");
    await expect
      .element(header("7").getByTestId("priority-group-count"))
      .toHaveTextContent("1 item");
    await expect.element(header("Legacy").getByTestId("priority-group-archived")).toBeVisible();
    expect(section("No priority").getByRole("treeitem").elements()).toHaveLength(2);
  });

  it("Keeps sub-items as rows inside their card with their details on a second line", async () => {
    await openProject({
      name: "Rows",
      items: [
        {
          title: "Parent",
          children: [
            { title: "Child", ticketNumber: "DB-7", priority: "High", dueDate: "2030-01-15" },
          ],
        },
        { title: "Plain" },
      ],
    });

    await expect
      .element(section("No priority").getByRole("treeitem", { name: "Child" }))
      .toBeVisible();
    await expect.element(item("Child")).toHaveAttribute("aria-level", "2");
    await expect
      .element(item("Child").getByTestId("item-row-details"))
      .toHaveTextContent("DB-7·High·Jan 15, 2030");
    await expect.element(item("Plain").getByTestId("item-row-details")).not.toBeInTheDocument();
    expect(page.getByTestId("item-card-header").elements()).toHaveLength(2);
  });

  it("Matches card heights in a row, keeps rows half the pane tall and sizes completed cards by content", async () => {
    await openProject({
      name: "Heights",
      items: [
        { title: "Short card" },
        {
          title: "Tall card",
          description: "Line one\nLine two\nLine three\nLine four",
          children: [{ title: "Sub 1" }, { title: "Sub 2" }, { title: "Sub 3" }],
        },
        { title: "Done card", completedAtUtc: "2026-11-12T10:00:00Z" },
      ],
    });

    await page.getByTestId("completed-section-toggle").click();
    await expect.element(surface("Done card")).toBeVisible();
    const height = (name: string) => surface(name).element().getBoundingClientRect().height;
    const pane = page.getByRole("main").element().clientHeight;

    expect(Math.abs(height("Short card") - height("Tall card"))).toBeLessThanOrEqual(1);
    expect(height("Short card")).toBeGreaterThan(pane / 2 - 120);
    expect(height("Done card")).toBeLessThan(height("Short card") / 2);
  });

  it("Uses fewer columns than Cards per row when the pane is too narrow", async () => {
    await openProject();
    const grid = () => page.getByTestId("card-grid").first();
    const { innerWidth, innerHeight } = window;
    onTestFinished(() => page.viewport(innerWidth, innerHeight));

    await page.viewport(1920, 1080);
    await expect.element(grid()).toHaveAttribute("data-columns", "4");
    await page.viewport(900, 800);

    await expect.element(grid()).toHaveAttribute("data-columns", "2");
  });

  it("Measures rows and columns again after the window is resized behind Search", async () => {
    const { innerWidth, innerHeight } = window;
    onTestFinished(() => page.viewport(innerWidth, innerHeight));
    await page.viewport(1000, 700);
    await openProject({
      name: "Short",
      items: [
        { title: "Plain card" },
        { title: "Parent card", children: [{ title: "Nested task" }] },
        { title: "High card", priority: "High" },
      ],
    });
    const grid = () => page.getByTestId("card-grid").first();
    const height = () => surface("Plain card").element().getBoundingClientRect().height;
    const searchHeading = page.getByRole("heading", { name: "Search", level: 1 });
    const smallHeight = height();
    await page.viewport(1440, 900);
    await expect.poll(height).toBeGreaterThan(smallHeight + 50);
    await item("Plain card").getByTestId("item-title").first().click();
    await userEvent.keyboard("{Control>}f{/Control}");
    await expect.element(searchHeading).toBeVisible();

    await page.viewport(1000, 700);
    await userEvent.keyboard("{Escape}");

    await expect.element(searchHeading).not.toBeInTheDocument();
    await expect.element(grid()).toHaveAttribute("data-columns", "3");
    await expect.poll(height).toBeCloseTo(smallHeight, 0);
    await expect.element(item("Plain card")).toHaveAttribute("aria-selected", "true");
  });

  it("Reflows the grid after Cards per row is saved in App Settings", async () => {
    const { store, projectId, history } = await openProject();
    await expect
      .element(page.getByTestId("card-grid").first())
      .toHaveAttribute("data-columns", "4");

    history.push("/settings");
    await page.getByRole("combobox", { name: "Cards per row" }).click();
    await page.getByRole("option", { name: "2", exact: true }).click();
    await page.getByTestId("save-global-settings").click();
    await expect.poll(() => store.settingsAndLookups.globalSettings.workspaceCardColumns).toBe(2);
    const save = page.getByTestId("save-global-settings");
    await expect.element(save).not.toHaveAttribute("aria-busy");
    await expect.element(save).toBeDisabled();
    history.push(`/projects/${projectId}`);
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    await expect.element(item("Plain card")).toBeVisible();

    await expect
      .element(page.getByTestId("card-grid").first())
      .toHaveAttribute("data-columns", "2");
  });

  it("Drops a card on the right third of a card in another section and one undo restores it", async () => {
    const { store, projectId } = await openProject();
    const target = point(surface("High first").element(), 0.85);

    await beginDrag(surface("Plain card").element(), target);
    await expect
      .element(surface("High first").getByTestId("drop-indicator"))
      .toHaveAttribute("data-placement", "after");
    await release(target);

    await expect.poll(sectionTitles).toEqual(["High"]);
    expect(cardTitles("High")).toEqual(["High first", "Plain card", "High second"]);
    expect(store.findItemByTitle(projectId, null, "Plain card")?.item.priorityLevelId).toBe(
      HIGH_ID,
    );
    await expect.element(item("Plain card")).toHaveFocus();
    await userEvent.keyboard("{Control>}z{/Control}");

    await expect.element(historyStatus()).toHaveTextContent("Undid: Set priority of 'Plain card'");
    await expect.poll(sectionTitles).toEqual(["No priority", "High"]);
    expect(store.areaSiblingTitles(projectId, null)).toEqual([
      "High first",
      "Plain card",
      "High second",
      "Done card",
    ]);
  });

  it("Highlights a section header under a drag and appends the card to that section", async () => {
    const { store } = await openProject();
    const target = point(header("High").element());

    await beginDrag(surface("Plain card").element(), target);
    await expect.element(header("High")).toHaveAttribute("data-drop-target", "true");
    await release(target);

    await expect.poll(sectionTitles).toEqual(["High"]);
    expect(cardTitles("High")).toEqual(["High first", "High second", "Plain card"]);
    expect(moves(store)).toBe(1);
  });

  it("Promotes a dragged sub-item into the section of the card it lands beside", async () => {
    const { store, projectId } = await openProject();
    const target = point(surface("High second").element(), 0.15);

    await beginDrag(surface("Nested task").element(), target);
    await expect
      .element(surface("High second").getByTestId("drop-indicator"))
      .toHaveAttribute("data-placement", "before");
    await release(target);

    await expect.element(item("Nested task")).toHaveAttribute("aria-level", "1");
    expect(cardTitles("High")).toEqual(["High first", "Nested task", "High second"]);
    expect(store.findItemByTitle(projectId, null, "Nested task")?.item.parentItemId).toBeNull();
    expect(moves(store)).toBe(1);
  });

  it("Makes a sub-item from the middle third and reorders in a section without a priority write", async () => {
    const { store, projectId } = await openProject();
    const middle = point(surface("High second").element(), 0.5);

    await beginDrag(surface("Plain card").element(), middle);
    await expect.element(page.getByText("Make sub-item", { exact: true })).toBeVisible();
    await release(middle);
    await expect.element(item("Plain card")).toHaveAttribute("aria-level", "2");
    const before = point(surface("High first").element(), 0.15);
    await beginDrag(surface("High second").element(), before);
    await release(before);

    await expect.poll(() => cardTitles("High")).toEqual(["High second", "High first"]);
    expect(store.areaSiblingTitles(projectId, null)).toEqual([
      "High second",
      "High first",
      "Done card",
    ]);
    expect(moves(store)).toBe(0);
  });

  it("Moves a focused card across a section edge with Alt+Down, then within its new section", async () => {
    const { store, projectId } = await openProject();
    item("Plain card").element().focus();

    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await expect.poll(sectionTitles).toEqual(["High"]);
    expect(cardTitles("High")).toEqual(["Plain card", "High first", "High second"]);
    await expect.element(item("Plain card")).toHaveFocus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await expect
      .poll(() => cardTitles("High"))
      .toEqual(["High first", "Plain card", "High second"]);
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await expect
      .poll(() => cardTitles("High"))
      .toEqual(["Plain card", "High first", "High second"]);
    // The emptied "No priority" section is hidden, so the card is at the start of the grid.
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

    await expect.element(item("Plain card")).toHaveFocus();
    expect(store.findItemByTitle(projectId, null, "Plain card")?.item.priorityLevelId).toBe(
      HIGH_ID,
    );
    expect(moves(store)).toBe(1);
    expect(store.calls.filter((call) => call === "DropItem")).toHaveLength(2);
  });

  it("Selects a clicked sub-item row rather than its card, and opens cards in the editor", async () => {
    await openProject();

    await item("Nested task").getByTestId("item-title").click();
    await expect.element(item("Nested task")).toHaveAttribute("aria-selected", "true");
    await expect.element(item("Plain card")).toHaveAttribute("aria-selected", "false");
    await expect.element(item("Nested task")).toHaveFocus();
    item("High first").element().focus();
    await userEvent.keyboard("{Enter}");

    const editor = page.getByRole("dialog", { name: "Edit item" });
    await expect.element(editor.getByRole("textbox", { name: "Title" })).toHaveValue("High first");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the 1080p and 1440p priority card grid baselines", async () => {
      const { store, history } = await renderApp({
        projects: [SNAPSHOT_PROJECT, { name: "Website" }],
      });
      history.push(`/projects/${store.summaries[0]!.project.id}`);
      await expect.element(item("Add index to Invoice.CustomerId")).toBeVisible();
      (document.activeElement as HTMLElement | null)?.blur();
      const { innerWidth, innerHeight } = window;
      onTestFinished(() => page.viewport(innerWidth, innerHeight));

      for (const [width, height, name] of [
        [1920, 1080, "1080p"],
        [2560, 1440, "1440p"],
      ] as const) {
        await page.viewport(width, height);
        page.getByRole("main").element().scrollTop = 0;
        await settleTheme(theme);
        await expect
          .element(page.getByTestId("app-shell"))
          .toMatchScreenshot(`card-grid-${name}-${theme}`);
      }
    });
  });
});
