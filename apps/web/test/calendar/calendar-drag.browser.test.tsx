import type {} from "@vitest/browser-playwright";
import { expect, it, onTestFinished } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { useReturnPageStore } from "../../src/state/return-page-store.js";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { renderApp } from "../support/render-app.js";

const entry = (name: string) => page.getByRole("button", { name: new RegExp(`^${name},`) });
const cell = (kind: string, date: string) =>
  page.elementLocator(
    document.querySelector(`[data-testid="calendar-${kind}"][data-date="${date}"]`)!,
  );

const defaultItems: NonNullable<SeedProject["items"]> = [
  { title: "Review", dueDate: "2026-11-16", dueTime: "10:07:00" },
  { title: "Audit", dueDate: "2026-11-16" },
  { title: "Meeting", dueDate: "2026-11-16", dueTime: "09:00:00" },
];

const calendar = () => page.getByTestId("calendar-page");
const ghost = () => page.getByTestId("calendar-drop-ghost");
const scroll = () => page.getByTestId("calendar-week-scroll").element();
const pressAlt = (keys: string) => userEvent.keyboard(`{Alt>}${keys}{/Alt}`);
const moveTag = "RescheduleCalendarEntry";

async function openCalendar(items = defaultItems, workspace = false) {
  const app = await renderApp({ projects: [{ name: "Billing", items }] });
  const projectId = app.store.summaries[0]!.project.id;
  if (workspace) {
    app.history.push(`/projects/${projectId}`);
    await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  }
  await userEvent.keyboard("{Control>}{Shift>}c{/Shift}{/Control}");
  await expect.element(page.getByTestId("calendar-entry").first()).toBeVisible();
  return { ...app, projectId };
}

/** Switching views loads a new range, so wait for its entries before reading their geometry. */
async function showView(shortcut: "m" | "w", grid: string) {
  await userEvent.keyboard(`{Control>}{Shift>}${shortcut}{/Shift}{/Control}`);
  await expect
    .element(page.getByTestId(grid).getByTestId("calendar-entry").first())
    .toBeInTheDocument();
}

const week = () => showView("w", "calendar-week-grid");
const month = () => showView("m", "calendar-month-grid");

function focus(name: string) {
  (entry(name).element() as HTMLElement).focus();
}

function point(element: Element, offsetY?: number) {
  const rect = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  return {
    x: Math.round((frame?.left ?? 0) + rect.left + rect.width / 2),
    y: Math.round((frame?.top ?? 0) + rect.top + (offsetY ?? rect.height / 2)),
  };
}

type Point = ReturnType<typeof point>;

const mouse = (
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  position: Point,
  buttons: number,
  button: "left" | "right" | "middle" | "none" = "none",
) => cdp().send("Input.dispatchMouseEvent", { ...position, type, buttons, button, clickCount: 1 });

async function drag(source: Point, target: Point) {
  await mouse("mouseMoved", source, 0);
  await mouse("mousePressed", source, 1, "left");
  onTestFinished(async () => {
    await mouse("mouseReleased", target, 0, "left");
  });
  await mouse("mouseMoved", target, 1);
}

const entryPoint = (name: string, offset?: number) => point(entry(name).element(), offset);
const cellPoint = (zone: string, date: string, offset?: number) =>
  point(cell(zone, date).element(), offset);
const releaseAt = (position: Point) => mouse("mouseReleased", position, 0, "left");

it("Drops a timed due entry on another month day and keeps its time", async () => {
  await openCalendar();

  await userEvent.dragAndDrop(entry("Review"), cell("month-cell", "2026-11-17"));

  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-17");
  await expect.element(entry("Review")).toHaveAccessibleName("Review, due 10:07");
});

it("Alt+Down snaps a focused entry to the next quarter and restores its focus", async () => {
  await openCalendar();
  (entry("Review").element() as HTMLElement).focus();

  await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

  await expect.element(entry("Review")).toHaveAccessibleName("Review, due 10:15");
  await expect.element(entry("Review")).toHaveFocus();
});

it("Shows a month cell outline and moves a timed due entry there with its time", async () => {
  const { store, projectId } = await openCalendar();
  const target = cell("month-cell", "2026-11-17");
  const position = point(target.element());

  await drag(entryPoint("Meeting"), position);
  await expect.element(target).toHaveAttribute("data-drop-active", "true");
  await releaseAt(position);

  await expect.element(target).not.toHaveAttribute("data-drop-active");
  await expect.element(entry("Meeting")).toHaveAttribute("data-date", "2026-11-17");
  expect(store.findItemByTitle(projectId, null, "Meeting")?.item.dueTime).toBe("09:00:00");
});

it("Uses the original grab offset and snaps the week ghost and due time to the same time", async () => {
  await openCalendar();
  await week();
  const position = cellPoint("time-column", "2026-11-17", 48 * 11 + 18);

  await drag(entryPoint("Meeting", 16), position);

  await expect.element(ghost()).toHaveTextContent("11:00");
  await releaseAt(position);
  await expect.element(entry("Meeting")).toHaveAccessibleName("Meeting, due 11:00");
  await expect.element(entry("Meeting")).toHaveAttribute("data-date", "2026-11-17");
  await expect.element(ghost()).not.toBeInTheDocument();
});

it("Moves a due entry between a week time column and the all-day row", async () => {
  await openCalendar();
  await week();
  const time = cellPoint("time-column", "2026-11-17", 48 * 11 + 8);
  const allDay = cell("allday-cell", "2026-11-18");
  const allDayPosition = point(allDay.element());
  const cellBefore = allDay.element().getBoundingClientRect();

  await drag(entryPoint("Audit"), time);
  await expect.element(ghost()).toHaveTextContent("11:15");
  await releaseAt(time);
  await expect.element(entry("Audit")).toHaveAccessibleName("Audit, due 11:15");

  await drag(entryPoint("Audit"), allDayPosition);

  await expect.element(allDay).toHaveAttribute("data-drop-active", "true");
  expect(allDay.element().getBoundingClientRect().height).toBe(cellBefore.height);
  await releaseAt(allDayPosition);
  await expect.element(entry("Audit")).toHaveAccessibleName("Audit, due all day");
  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-18");
});

it("Moves an all-day entry to another all-day cell", async () => {
  await openCalendar();
  await week();
  const target = cell("allday-cell", "2026-11-18");
  const position = point(target.element());

  await drag(entryPoint("Audit"), position);
  await expect.element(target).toHaveAttribute("data-drop-active", "true");
  await releaseAt(position);

  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-18");
  await expect.element(entry("Audit")).toHaveAccessibleName("Audit, due all day");
});

it("Updates the week ghost when the wheel scrolls beneath a stationary pointer", async () => {
  const { store } = await openCalendar();
  await week();
  const position = cellPoint("time-column", "2026-11-17", 48 * 11);

  await drag(entryPoint("Audit"), position);
  await expect.element(ghost()).toHaveTextContent("11:00");

  await cdp().send("Input.dispatchMouseEvent", {
    ...position,
    type: "mouseWheel",
    deltaX: 0,
    deltaY: 48,
    buttons: 1,
  });

  await expect.element(ghost()).toHaveTextContent("12:00");
  await userEvent.keyboard("{Escape}");
  await releaseAt(position);
  await expect.element(calendar()).toBeVisible();
  await expect.element(ghost()).not.toBeInTheDocument();
  expect(store.calls).not.toContain(moveTag);
});

it.each(["Escape", "outside", "lost capture", "lost button release"] as const)(
  "Cancels a drag without writing or activating an entry after %s",
  async (reason) => {
    const { store } = await openCalendar();
    const target = cell("month-cell", "2026-11-17");
    const position = point(target.element());

    await drag(entryPoint("Review"), position);
    await expect.element(target).toHaveAttribute("data-drop-active");
    if (reason === "Escape") {
      await userEvent.keyboard("{Escape}");
    } else if (reason === "lost capture") {
      const root = calendar().element();
      const pointerId = [1, 2].find((id) => root.hasPointerCapture(id));
      expect(pointerId).toBeDefined();
      await mouse("mouseMoved", { ...position, y: position.y + 1 }, 1);
      root.releasePointerCapture(pointerId!);
      await mouse("mouseMoved", { ...position, y: position.y + 2 }, 1);
    } else if (reason === "lost button release") {
      const root = calendar().element();
      const pointerId = [1, 2].find((id) => root.hasPointerCapture(id));
      expect(pointerId).toBeDefined();
      root.dispatchEvent(
        new PointerEvent("pointermove", { pointerId: pointerId!, buttons: 0, bubbles: true }),
      );
    }
    await releaseAt(reason === "outside" ? { ...position, y: 8 } : position);

    await expect.element(target).not.toHaveAttribute("data-drop-active");
    await expect.element(calendar()).toBeVisible();
    expect(store.calls).not.toContain(moveTag);
    expect(store.calls).not.toContain("LocateCalendarItem");
  },
);

it("A sub-threshold press still activates the item", async () => {
  const { store } = await openCalendar();
  const from = entryPoint("Review");
  const position = { ...from, x: from.x + 3 };

  await drag(from, position);
  await releaseAt(position);

  await expect.element(calendar()).not.toBeInTheDocument();
  expect(store.calls).toContain("LocateCalendarItem");
  expect(store.calls).not.toContain(moveTag);
});

it.each(["right", "middle"] as const)("A %s press cannot start a drag", async (button) => {
  const { store } = await openCalendar();
  const from = entryPoint("Review");
  const position = cellPoint("month-cell", "2026-11-17");
  const buttons = button === "right" ? 2 : 4;

  await mouse("mousePressed", from, buttons, button);
  await mouse("mouseMoved", position, buttons);
  await mouse("mouseReleased", position, 0, button);

  await expect.element(calendar()).not.toHaveAttribute("data-dragging");
  expect(store.calls).not.toContain(moveTag);
});

it.each(["right", "middle"] as const)(
  "An extra %s press does not arm a drag from empty space",
  async (button) => {
    const { store } = await openCalendar();
    const buttons = button === "right" ? 2 : 4;
    const from = cellPoint("month-cell", "2026-11-18");
    const overEntry = entryPoint("Review");
    const other = cellPoint("month-cell", "2026-11-17");

    await drag(from, overEntry);
    await mouse("mousePressed", overEntry, 1 | buttons, button);
    await mouse("mouseMoved", other, 1 | buttons);
    await mouse("mouseReleased", other, 1, button);
    await releaseAt(other);

    await expect.element(calendar()).not.toHaveAttribute("data-dragging");
    expect(store.calls).not.toContain(moveTag);
  },
);

it("Pressing and releasing a different button mid-drag keeps the original source armed", async () => {
  const { store } = await openCalendar();
  const position = cellPoint("month-cell", "2026-11-17");
  const otherEntry = entryPoint("Meeting");

  await drag(entryPoint("Review"), position);
  await mouse("mouseMoved", otherEntry, 1);
  await mouse("mousePressed", otherEntry, 3, "right");
  await mouse("mouseMoved", position, 3);
  await mouse("mouseReleased", position, 1, "right");

  await expect.element(calendar()).toHaveAttribute("data-dragging");
  expect(store.calls).not.toContain(moveTag);
  await releaseAt(position);
  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-17");
  await expect.element(entry("Meeting")).toHaveAttribute("data-date", "2026-11-16");
});

it("Dropping on the same slot writes nothing and does not reload or add a history step", async () => {
  const { store } = await openCalendar();
  const loads = () => store.calls.filter((tag) => tag === "LoadCalendar").length;
  const before = loads();

  await drag(entryPoint("Review"), cellPoint("month-cell", "2026-11-16", 100));
  await releaseAt(cellPoint("month-cell", "2026-11-16", 100));
  await expect.poll(() => store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  await userEvent.keyboard("{Control>}z{/Control}");

  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-16");
  expect(loads()).toBe(before);
  expect(store.calls).not.toContain("ApplyHistory");
});

it("Moves a completed item and keeps it completed", async () => {
  await openCalendar([
    ...defaultItems,
    { title: "Finished", dueDate: "2026-11-17", completedAtUtc: "2026-11-15T10:00:00Z" },
  ]);
  await page.getByRole("checkbox", { name: "Include completed" }).click();
  const done = entry("✓ Finished");
  await expect.element(done).toBeVisible();

  await userEvent.dragAndDrop(done, cell("month-cell", "2026-11-18"));

  await expect.element(done).toHaveAttribute("data-date", "2026-11-18");
});

it("Reports a deleted item inline and reloads the entries after a stale drop", async () => {
  const { store, projectId } = await openCalendar();
  const position = cellPoint("month-cell", "2026-11-17");
  const item = store.findItemByTitle(projectId, null, "Review")!.item;

  await drag(entryPoint("Review"), position);
  store.deleteItem(projectId, null, item.id);
  await releaseAt(position);

  await expect
    .element(page.getByTestId("calendar-error"))
    .toHaveTextContent("Item is missing or deleted.");
  await expect.element(entry("Review")).not.toBeInTheDocument();
});

it("A drop uses the time from an edit made after the pointer press", async () => {
  const { store, projectId } = await openCalendar();
  const position = cellPoint("month-cell", "2026-11-17");
  const item = store.findItemByTitle(projectId, null, "Review")!.item;

  await drag(entryPoint("Review"), position);
  store.patchItem(item.id, { dueTime: "13:30:00" });
  await releaseAt(position);

  await expect.element(entry("Review")).toHaveAccessibleName("Review, due 13:30");
  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-17");
});

it("Restores an all-day entry's focus on Alt+Right and replays the calendar move", async () => {
  await openCalendar();
  focus("Audit");

  await pressAlt("{ArrowRight}");

  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-17");
  await expect.element(entry("Audit")).toHaveFocus();
  await userEvent.keyboard("{Control>}z{/Control}");
  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-16");
  await userEvent.keyboard("{Control>}y{/Control}");
  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-17");
});

it("Snaps Alt+Up and Alt+Down in Week view and nudges a due time in Month view", async () => {
  await openCalendar();
  await week();
  focus("Review");

  await pressAlt("{ArrowUp}");
  await expect.element(entry("Review")).toHaveAccessibleName("Review, due 10:00");
  await pressAlt("{ArrowDown}");
  await expect.element(entry("Review")).toHaveAccessibleName("Review, due 10:15");
  await month();
  focus("Meeting");
  await pressAlt("{ArrowDown}");

  await expect.element(entry("Meeting")).toHaveAccessibleName("Meeting, due 09:15");
});

it("Ignores minute keys on all-day entries and arrows with other modifiers", async () => {
  const { store } = await openCalendar();

  focus("Audit");
  await pressAlt("{ArrowDown}{ArrowUp}");
  focus("Review");
  await userEvent.keyboard(
    "{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}{Control>}{ArrowLeft}{/Control}{ArrowLeft}{ArrowRight}",
  );

  expect(store.calls).not.toContain(moveTag);
  await expect.element(entry("Audit")).toHaveAccessibleName("Audit, due all day");
  await expect.element(entry("Review")).toHaveAccessibleName("Review, due 10:07");
});

it("Keeps held Alt+Right steps after the entry leaves the visible period", async () => {
  const { store, projectId } = await openCalendar([{ title: "Boundary", dueDate: "2026-11-21" }]);
  await week();
  focus("Boundary");
  const release = store.hold(moveTag);
  onTestFinished(release);

  await pressAlt("{ArrowRight>4/}");
  await expect.poll(() => store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  release();

  await expect
    .poll(() => store.findItemByTitle(projectId, null, "Boundary")?.item.dueDate)
    .toBe("2026-11-25");
  await expect.element(page.getByTestId("calendar-next")).toHaveFocus();
  await expect.element(page.getByTestId("calendar-title")).toHaveTextContent("Nov 15 – 21, 2026");
  expect(store.calls.filter((tag) => tag === moveTag)).toHaveLength(2);
});

it("A newer waiting drop replaces the previous one", async () => {
  const { store, projectId } = await openCalendar();
  focus("Review");
  const release = store.hold(moveTag);
  onTestFinished(release);

  await pressAlt("{ArrowDown}");
  await expect.poll(() => store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  await userEvent.dragAndDrop(entry("Review"), cell("month-cell", "2026-11-17"));
  await userEvent.dragAndDrop(entry("Review"), cell("month-cell", "2026-11-18"));
  release();

  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-18");
  expect(store.findItemByTitle(projectId, null, "Review")?.item.dueTime).toBe("10:15:00");
  expect(store.calls.filter((tag) => tag === moveTag)).toHaveLength(2);
});

it("A failed move drops queued steps, reports the failure and preserves focus", async () => {
  const { store } = await openCalendar();
  const loadCount = store.calls.filter((tag) => tag === "LoadCalendar").length;
  store.calendar.moveFailure = true;
  const release = store.hold(moveTag);
  onTestFinished(release);
  focus("Review");

  await pressAlt("{ArrowRight>4/}");
  await expect.poll(() => store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  release();

  await expect
    .element(page.getByTestId("calendar-error"))
    .toHaveTextContent("The operation could not be completed.");
  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-16");
  await expect.element(entry("Review")).toHaveFocus();
  expect(store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  expect(store.calls.filter((tag) => tag === "LoadCalendar")).toHaveLength(loadCount);
});

it("Escape returns to the workspace after an in-flight calendar write commits", async () => {
  const { store, projectId } = await openCalendar(defaultItems, true);
  const release = store.hold(moveTag);
  onTestFinished(release);
  focus("Review");

  await pressAlt("{ArrowRight}");
  await userEvent.keyboard("{Escape}");
  await expect.element(calendar()).toBeVisible();
  release();

  await expect.element(calendar()).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("treeitem", { name: "Review", exact: true }))
    .toMatchTextContent("Nov 17, 2026");
  expect(store.findItemByTitle(projectId, null, "Review")?.item.dueDate).toBe("2026-11-17");
});

it("Focuses the more button when the moved entry becomes hidden by overflow", async () => {
  await openCalendar([
    { title: "Zebra", dueDate: "2026-11-16" },
    ...["Alpha", "Bravo", "Charlie"].map((title) => ({ title, dueDate: "2026-11-17" })),
  ]);
  focus("Zebra");

  await pressAlt("{ArrowRight}");

  await expect.element(entry("Zebra")).not.toBeInTheDocument();
  await expect.element(page.getByTestId("calendar-more-button")).toHaveFocus();
});

it("Focuses Previous when an entry moves before the current period", async () => {
  await openCalendar([{ title: "Boundary", dueDate: "2026-11-15" }]);
  await week();
  focus("Boundary");

  await pressAlt("{ArrowLeft}");

  await expect.element(entry("Boundary")).not.toBeInTheDocument();
  await expect.element(page.getByTestId("calendar-previous")).toHaveFocus();
});

it("Dragging from overflow or the scroll gutter does not start a drag", async () => {
  const { store } = await openCalendar([
    ...defaultItems,
    { title: "Zebra", dueDate: "2026-11-16" },
  ]);
  const more = page.getByTestId("calendar-more-button");
  const position = cellPoint("month-cell", "2026-11-17");

  await drag(point(more.element()), position);
  await releaseAt(position);
  await expect.element(more).toBeVisible();
  await week();
  const gutter = scroll().getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  const edge = {
    x: Math.floor((frame?.left ?? 0) + gutter.right - 1),
    y: Math.floor((frame?.top ?? 0) + gutter.top + 12),
  };
  const time = cellPoint("time-column", "2026-11-17", 48 * 10);
  await drag(edge, time);
  await releaseAt(time);

  await expect.element(calendar()).not.toHaveAttribute("data-dragging");
  expect(store.calls).not.toContain(moveTag);
});

for (const theme of THEMES) {
  it(`Matches the month, time-grid and all-day drag feedback in ${theme} mode`, async () => {
    await openCalendar();
    await settleTheme(theme);
    const shot = (name: string) => expect.element(calendar()).toMatchScreenshot(`${name}-${theme}`);
    const monthCell = cell("month-cell", "2026-11-17");

    await drag(entryPoint("Review"), point(monthCell.element()));
    await expect.element(monthCell).toHaveAttribute("data-drop-active");
    await shot("calendar-month-drag");
    await userEvent.keyboard("{Escape}");
    await releaseAt(point(monthCell.element()));

    await week();
    await drag(entryPoint("Meeting", 16), cellPoint("time-column", "2026-11-17", 48 * 11 + 18));
    await expect.element(ghost()).toHaveTextContent("11:00");
    await shot("calendar-week-drag");
    await userEvent.keyboard("{Escape}");
    await releaseAt(cellPoint("time-column", "2026-11-17", 48 * 11 + 18));

    const allDay = cell("allday-cell", "2026-11-18");
    await drag(entryPoint("Audit"), point(allDay.element()));
    await expect.element(allDay).toHaveAttribute("data-drop-active");
    await shot("calendar-week-allday-drag");
    await userEvent.keyboard("{Escape}");
    await releaseAt(point(allDay.element()));
  });
}

it("Combines day and quarter-hour keys for a due time outside the visible period", async () => {
  const { store, projectId } = await openCalendar([
    { title: "Deploy", dueDate: "2026-11-21", dueTime: "09:00:00" },
  ]);
  await week();
  const release = store.hold(moveTag);
  onTestFinished(release);
  focus("Deploy");

  await pressAlt("{ArrowRight>3/}{ArrowDown>2/}");
  await expect.poll(() => store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  release();

  await expect
    .poll(() => store.findItemByTitle(projectId, null, "Deploy")?.item.dueDate)
    .toBe("2026-11-24");
  expect(store.findItemByTitle(projectId, null, "Deploy")?.item.dueTime).toBe("09:30:00");
  await expect.element(page.getByTestId("calendar-next")).toHaveFocus();
  expect(store.calls.filter((tag) => tag === moveTag)).toHaveLength(2);
});

it("A pointer drop does not focus the moved entry", async () => {
  await openCalendar();

  await userEvent.dragAndDrop(entry("Review"), cell("month-cell", "2026-11-17"));

  await expect.element(entry("Review")).toHaveAttribute("data-date", "2026-11-17");
  await expect.element(entry("Review")).not.toHaveFocus();
});

it("Opens the row menu on a moved entry, and Escape closes only the menu", async () => {
  await openCalendar();
  focus("Audit");
  await pressAlt("{ArrowRight}");
  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-17");
  await expect.element(entry("Audit")).toHaveFocus();

  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await expect.element(page.getByTestId("calendar-entry-menu")).toBeVisible();
  await userEvent.keyboard("{Escape}");

  await expect.element(page.getByTestId("calendar-entry-menu")).not.toBeInTheDocument();
  await expect.element(calendar()).toBeVisible();
  await expect.element(entry("Audit")).toHaveFocus();
});

it("Does not drag an entry pressed with the right button to open its menu", async () => {
  const { store } = await openCalendar();

  await entry("Audit").click({ button: "right" });
  await expect.element(page.getByTestId("calendar-entry-menu")).toBeVisible();
  await userEvent.keyboard("{Escape}");

  expect(store.calls).not.toContain(moveTag);
  await expect.element(entry("Audit")).toHaveAttribute("data-date", "2026-11-16");
  await expect.element(calendar()).not.toHaveAttribute("data-dragging");
});

/**
 * Back, sidebar links and other covering pages wait for a running save, and a
 * redirect of the page behind keeps Calendar shown, so only teardown can hide
 * it mid-save. Hiding it directly stands in for that.
 */
it("Hiding Calendar during a save drops waiting steps and calendar focus recovery", async () => {
  const { store } = await openCalendar(defaultItems, true);
  focus("Audit");
  const release = store.hold(moveTag);
  onTestFinished(release);

  await pressAlt("{ArrowRight>3/}");
  await expect.poll(() => store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  useReturnPageStore.getState().uncover();
  await expect.element(calendar()).not.toBeInTheDocument();
  const loads = store.calls.filter((tag) => tag === "LoadCalendar").length;
  release();

  await expect
    .element(page.getByRole("treeitem", { name: "Audit", exact: true }))
    .toMatchTextContent("Nov 17, 2026");
  expect(store.calls.filter((tag) => tag === moveTag)).toHaveLength(1);
  expect(store.calls.filter((tag) => tag === "LoadCalendar")).toHaveLength(loads);
  await expect.element(page.getByTestId("calendar-next")).not.toBeInTheDocument();
});
