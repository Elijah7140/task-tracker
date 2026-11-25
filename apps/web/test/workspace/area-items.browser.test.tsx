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
      {
        name: "Billing DB",
        items: [{ title: MEETING, dueDate: "2026-11-14", dueTime: "15:00:00" }],
        folders: [{ name: "Reporting" }],
      },
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
      { title: MEETING, dueDate: "2026-11-14", dueTime: "15:00:00", urgency: "Imminent" },
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

  it("Falls back to the project root with a message when the open folder is deleted elsewhere", async () => {
    const { advance, clock } = createTestClock();
    const { store, projectId, history } = await openProject(clock);
    const reporting = store.folderNamed("Reporting");
    history.push(`/projects/${projectId}/folders/${reporting.id}`);
    await expect.element(page.getByRole("heading", { level: 1, name: "Reporting" })).toBeVisible();
    store.removeFolder(reporting.id);

    await advance("1 minute");

    await expect
      .element(page.getByRole("alertdialog", { name: "Folder unavailable" }))
      .toHaveAccessibleDescription("Folder is missing or deleted.");
    await expect.element(page.getByTestId("area-load-failure")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "OK" }).click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    await expect
      .element(page.getByRole("treeitem", { name: "Reporting", exact: true }))
      .not.toBeInTheDocument();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Shows an empty state for an area without items", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Website" }] });

    history.push(`/projects/${store.summaries[0]?.project.id}`);

    await expect
      .element(page.getByTestId("empty-area"))
      .toHaveTextContent("No items in this area yet.");
  });
});

describe("Auto-hide completed (§6.2)", () => {
  const tree = () => page.getByRole("tree", { name: "Items in Billing DB" });
  const card = (name: string) => tree().getByRole("treeitem", { name, exact: true });
  const completedSection = () => tree().getByRole("treeitem", { name: "Completed (1)" });

  async function openWith(autoHideCompleted: boolean) {
    const { clock, advance } = createTestClock();
    const app = await renderApp({
      clock,
      projects: [
        {
          name: "Billing DB",
          items: [
            { title: "Write report" },
            { title: "Ship fix", kind: "Ticket", ticketNumber: "4021" },
            { title: "Plan sprint" },
          ],
        },
      ],
      configure: (store) => store.settingsAndLookups.setGlobalSettings({ autoHideCompleted }),
    });
    const projectId = app.store.summaries[0]?.project.id ?? "";
    app.history.push(`/projects/${projectId}`);
    await expect.element(card("Write report")).toBeVisible();
    return { ...app, projectId, advance };
  }

  const complete = (name: string) => card(name).getByTestId("item-completion").first().click();

  it("Keeps a ToDo checked in place through reloads until the user leaves and returns", async () => {
    const { history, projectId, advance } = await openWith(false);

    await complete("Write report");
    await expect
      .element(card("Write report").getByTestId("item-completion").first())
      .toHaveAttribute("data-completed", "true");
    await advance("1 minute");

    await expect.element(completedSection()).not.toBeInTheDocument();
    await expect.element(card("Write report")).toBeVisible();

    history.push("/");
    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    history.push(`/projects/${projectId}`);

    await expect.element(completedSection()).toBeVisible();
    await expect.element(card("Write report")).not.toBeInTheDocument();
  });

  it("Keeps a checked card ahead of a later status when auto-hide is off", async () => {
    const app = await renderApp({
      projects: [
        {
          name: "Billing DB",
          items: [
            { title: "Write report", status: "Queued" },
            { title: "Plan sprint", status: "Testing" },
          ],
        },
      ],
      configure: (store) =>
        store.settingsAndLookups.setGlobalSettings({ autoHideCompleted: false }),
    });
    app.history.push(`/projects/${app.store.summaries[0]?.project.id}`);
    const first = card("Write report");
    const second = card("Plan sprint");
    await expect.element(first).toBeVisible();

    await complete("Write report");
    await expect.element(first.getByTestId("item-status-chip")).toHaveTextContent("Completed");

    const position = first.element().compareDocumentPosition(second.element());
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Moves a checked ToDo to Completed at once with the setting on", async () => {
    await openWith(true);

    await complete("Write report");

    await expect.element(completedSection()).toBeVisible();
    await expect.element(card("Write report")).not.toBeInTheDocument();
  });

  it("Moves a completed ticket to Completed at once with the setting off", async () => {
    await openWith(false);

    await complete("Ship fix");

    await expect.element(completedSection()).toBeVisible();
    await expect.element(card("Ship fix")).not.toBeInTheDocument();
  });

  it("Reopens a ToDo kept in place", async () => {
    await openWith(false);
    await complete("Write report");
    const mark = card("Write report").getByTestId("item-completion").first();
    await expect.element(mark).toHaveAttribute("data-completed", "true");

    await mark.click();

    await expect.element(mark).toHaveAttribute("data-completed", "false");
    await expect.element(completedSection()).not.toBeInTheDocument();
  });
});
