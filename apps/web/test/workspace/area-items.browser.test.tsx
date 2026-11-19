import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { createTestClock } from "../support/test-clock.js";

const MEETING = "Schema review with the data team";

const meetingUrgency = () =>
  page.getByRole("treeitem", { name: MEETING }).getByTestId("item-urgency");

async function openProject(clock: ReturnType<typeof createTestClock>["clock"]) {
  const app = await renderApp({
    clock,
    projects: [
      { name: "Billing DB", items: [{ title: MEETING, scheduledStart: "2026-11-14T15:00:00" }] },
    ],
  });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByRole("treeitem", { name: MEETING })).toBeVisible();
  return { ...app, projectId };
}

const loadCount = (calls: ReadonlyArray<string>) =>
  calls.filter((call) => call === "LoadArea").length;

describe("AreaItems", () => {
  it("Shows urgency the server reports on the next minute without a manual refresh", async () => {
    const { advance, clock } = createTestClock();
    const { store, projectId } = await openProject(clock);
    await expect.element(meetingUrgency()).not.toBeInTheDocument();
    store.setItems(projectId, null, [
      { title: MEETING, scheduledStart: "2026-11-14T15:00:00", urgency: "Imminent" },
    ]);

    await advance("1 minute");

    await expect.element(meetingUrgency()).toHaveTextContent("Imminent");
  });

  it("Asks the server once per minute and not in between", async () => {
    const { advance, clock } = createTestClock();
    const { store } = await openProject(clock);
    const initial = loadCount(store.calls);

    await advance("59 seconds");
    const beforeMinute = loadCount(store.calls);
    await advance("1 second");
    await expect.poll(() => loadCount(store.calls)).toBe(initial + 1);
    await advance("1 minute");

    await expect.poll(() => loadCount(store.calls)).toBe(initial + 2);
    expect(beforeMinute).toBe(initial);
  });

  it("Stops refreshing an area after leaving it", async () => {
    const { advance, clock } = createTestClock();
    const { store, history } = await openProject(clock);
    history.push("/");
    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    const afterLeaving = loadCount(store.calls);

    await advance("5 minutes");

    expect(loadCount(store.calls)).toBe(afterLeaving);
  });

  it("Shows an empty state for an area without items", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Website" }] });

    history.push(`/projects/${store.summaries[0]?.project.id}`);

    await expect
      .element(page.getByTestId("empty-area"))
      .toHaveTextContent("No items in this area yet.");
  });
});
