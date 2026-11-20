import type { RecurrenceRule } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedItem } from "../support/fake-area-items.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";

type Rule = typeof RecurrenceRule.Type;

const weekly = (overrides: Partial<Rule> = {}): Rule => ({
  frequency: "Weekly",
  interval: 1,
  weekdays: 16,
  monthDay: null,
  month: null,
  anchor: "DueDate",
  endKind: "Never",
  endDate: null,
  remaining: null,
  ...overrides,
});

const ITEMS: ReadonlyArray<SeedItem> = [
  {
    title: "Weekly report",
    type: "Change",
    priority: "High",
    dueDate: "2026-11-20",
    recurrence: weekly(),
    children: [
      { title: "Collect figures", dueDate: "2026-11-19", recurrence: weekly({ weekdays: 8 }) },
    ],
  },
  {
    title: "Final audit",
    dueDate: "2026-11-27",
    recurrence: weekly({ endKind: "AfterCount", remaining: 1 }),
  },
  { title: "One-off task", dueDate: "2026-11-21" },
];

const card = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const marker = (title: string) => card(title).getByTestId("repeat-marker").first();
const notice = () => page.getByTestId("status-notice");
const menuItem = (name: string) => page.getByRole("menuitem", { name, exact: true });

async function openWorkspace(clock?: ReturnType<typeof createTestClock>["clock"]) {
  const app = await renderApp({
    projects: [{ name: "Ops", items: ITEMS }],
    ...(clock === undefined ? {} : { clock }),
  });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(card("Weekly report")).toBeVisible();
  const stored = (title: string) => app.store.findItemByTitle(projectId, null, title)?.item;
  const titles = () => app.store.areaSiblingTitles(projectId, null);
  return { ...app, projectId, stored, titles };
}

async function openCardMenu(title: string) {
  await card(title).getByTestId("item-title").first().click({ button: "right" });
}

describe("Repeating items in the workspace", () => {
  it("Marks repeating cards and sub-items with the rule as a tooltip", async () => {
    const { stored } = await openWorkspace();

    await expect.element(marker("Weekly report")).toHaveAccessibleName("Repeats: Weekly on Fri");
    await expect
      .element(card("Collect figures").getByTestId("repeat-marker"))
      .toHaveAccessibleName("Repeats: Weekly on Thu");
    await expect.element(card("One-off task").getByTestId("repeat-marker")).not.toBeInTheDocument();
    await marker("Weekly report").hover();
    await expect
      .element(page.getByTestId("repeat-marker-tooltip"))
      .toHaveTextContent("Weekly on Fri");
    const details = document.getElementById(`item-details-${stored("Weekly report")!.id}`);
    expect(details?.textContent).toContain("repeats Weekly on Fri");
  });

  it("Completing a repeating card with the checkbox shows the next occurrence open", async () => {
    const { store, projectId, titles } = await openWorkspace();
    const sourceId = store.findItemByTitle(projectId, null, "Weekly report")!.item.id;

    await card("Weekly report").getByTestId("item-completion").first().click();
    const question = page.getByRole("alertdialog", { name: "Complete sub-items" });
    await question.getByRole("button", { name: "Complete" }).click();

    await expect
      .poll(titles)
      .toEqual(["Weekly report", "Weekly report", "Final audit", "One-off task"]);
    const area = store
      .allAreas()
      .find((state) => state.nodes.some((node) => node.item.id === sourceId))!;
    const [source, next] = area.nodes;
    expect(source!.item.completedAtUtc).not.toBeNull();
    expect(next!.item).toMatchObject({ completedAtUtc: null, dueDate: "2026-11-27" });
    await expect.element(card("Weekly report").first()).toBeVisible();
    await expect.element(notice()).not.toBeInTheDocument();
  });

  it("Shows the last-repeat notice until the renderer clock dismisses it", async () => {
    const { advance, clock } = createTestClock();
    await openWorkspace(clock);

    await card("Final audit").getByTestId("item-completion").click();

    await expect.element(notice()).toHaveTextContent("That was the last repeat.");
    await advance("9 seconds");
    await expect.element(notice()).toBeVisible();
    await advance("2 seconds");
    await expect.element(notice()).not.toBeInTheDocument();
  });

  it("Skips this one from the card's context menu", async () => {
    const { stored, store } = await openWorkspace();

    await openCardMenu("Weekly report");
    await menuItem("Skip this one").click();

    await expect.poll(() => stored("Weekly report")?.dueDate).toBe("2026-11-27");
    expect(store.calls.filter((call) => call === "SkipRepeat")).toHaveLength(1);
    expect(stored("Weekly report")?.completedAtUtc).toBeNull();
  });

  it("Stops repeating with the keyboard menu", async () => {
    const { stored } = await openWorkspace();
    await card("Weekly report").getByTestId("item-title").first().click();

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await expect.element(menuItem("Stop repeating")).toBeVisible();
    // Edit, Set priority, Complete, Set status, Push back one day, Set as current item and
    // Skip this one come first.
    await userEvent.keyboard(
      "{Home}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}",
    );
    await expect.element(menuItem("Stop repeating")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const ownMarker = card("Weekly report").getByRole("img", { name: "Repeats: Weekly on Fri" });
    await expect.element(ownMarker).not.toBeInTheDocument();
    expect(stored("Weekly report")?.recurrence).toBeNull();
    expect(stored("Collect figures")?.recurrence).toEqual(weekly({ weekdays: 8 }));
  });

  it("Offers repeat commands only on repeating items, and no skip once completed", async () => {
    await openWorkspace();

    await openCardMenu("One-off task");
    await expect.element(menuItem("Edit…")).toBeVisible();
    await expect.element(menuItem("Skip this one")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await card("Final audit").getByTestId("item-completion").click();
    await page.getByTestId("completed-section-toggle").first().click();
    await openCardMenu("Final audit");

    await expect.element(menuItem("Skip this one")).toHaveAttribute("aria-disabled", "true");
    await expect.element(menuItem("Stop repeating")).toBeVisible();
  });

  it.each(THEMES)("Matches the repeating cards baseline in %s", async (theme) => {
    const { clock } = createTestClock();
    await openWorkspace(clock);
    await card("Final audit").getByTestId("item-completion").click();
    await expect.element(notice()).toBeVisible();

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`workspace-repeating-cards-${theme}`);
  });
});
