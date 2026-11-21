import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderTrayCard } from "../support/render-tray-card.js";
import { useThemeStore } from "../../src/state/theme-store.js";
import { THEMES } from "../support/screenshots.js";

const REVIEW = "Review release notes";
const OUTAGE = "Investigate outage";
const QUEUED = "Write the retrospective";
const TESTING = "Verify the hotfix";

const PROJECT: SeedProject = {
  name: "Billing",
  folders: [
    {
      name: "dbo",
      items: [],
    },
    {
      name: "Views",
      parent: "dbo",
      items: [
        {
          title: REVIEW,
          status: "In progress",
          priority: "High",
          dueDate: "2026-11-20",
          dueTime: "14:30:00",
          children: [{ title: "Update changelog" }, { title: "Tag the build" }],
        },
      ],
    },
  ],
  items: [
    { title: OUTAGE, kind: "Ticket", ticketNumber: "INC-42", status: "In progress" },
    { title: QUEUED, status: "Queued" },
    { title: TESTING, status: "Testing" },
  ],
};

const card = () => page.getByRole("region", { name: "In progress" });
const rows = () => card().getByTestId("tray-card-row");
const rowFor = (title: string) => rows().filter({ hasText: title });
const completeButton = (label: string) =>
  card().getByRole("button", { name: `Complete ${label}`, exact: true });
const openButton = (label: string) =>
  card().getByRole("button", { name: `Open ${label} in Task Tracker` });

function itemNamed(store: FakeProjectStore, title: string) {
  for (const area of store.allAreas()) {
    const found = area.nodes.find((node) => node.item.title === title);
    if (found !== undefined) {
      return found.item;
    }
  }
  throw new Error(`No item named ${title}.`);
}

function markTesting(store: FakeProjectStore) {
  const testing = store.statuses.rows.find((row) => row.name === "Testing")!;
  store.statuses.replace(testing.id, { isInProgress: true });
}

function titlesInOrder() {
  return rows()
    .elements()
    .map((row) => row.querySelector("[data-testid=tray-card-title]")?.textContent ?? "");
}

/** Stands in for the preload bridge's tray card calls. */
function stubBridge() {
  const opened: Array<string> = [];
  const heights: Array<number> = [];
  const poppedOut: Array<true> = [];
  const onTop: Array<boolean> = [];
  vi.stubGlobal("taskTrackerDesktop", {
    getRpcConnection: async () => undefined,
    openExternalLink: async () => false,
    openItemFromTrayCard: async (itemId: string) => {
      opened.push(itemId);
      return true;
    },
    reportTrayCardHeight: (height: number) => heights.push(height),
    popOutTrayCard: async () => {
      poppedOut.push(true);
      return true;
    },
    setInProgressWindowOnTop: async (value: boolean) => {
      onTop.push(value);
      return value;
    },
  });
  return { opened, heights, poppedOut, onTop };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("task-tracker.in-progress-on-top");
});

describe("contents", () => {
  it("With nothing in progress the card explains how items get there", async () => {
    await renderTrayCard({ projects: [{ name: "Ops", items: [{ title: QUEUED }] }] });

    await expect.element(card().getByTestId("tray-card-empty")).toBeVisible();

    await expect
      .element(card().getByTestId("tray-card-empty"))
      .toMatchTextContent(
        "Nothing in progress.Set an item's status to In progress. App Settings chooses which statuses count as in progress.",
      );
    await expect.element(card().getByTestId("tray-card-count")).toHaveTextContent("0");
  });

  it("Lists every open ToDo and ticket with an in-progress status", async () => {
    await renderTrayCard({ projects: [PROJECT] });

    await expect.element(rowFor(REVIEW)).toBeVisible();

    await expect.element(rowFor(OUTAGE)).toBeVisible();
    await expect.element(rowFor(QUEUED)).not.toBeInTheDocument();
    await expect.element(rowFor(TESTING)).not.toBeInTheDocument();
    await expect.element(card().getByTestId("tray-card-count")).toHaveTextContent("2");
  });

  it("A row shows the ticket number, area path, priority and due date", async () => {
    await renderTrayCard({ projects: [PROJECT] });

    await expect
      .element(rowFor(OUTAGE).getByTestId("tray-card-ticket"))
      .toHaveTextContent("INC-42");

    const review = rowFor(REVIEW);
    await expect
      .element(review.getByTestId("tray-card-area"))
      .toHaveTextContent("Billing › dbo › Views");
    await expect.element(review.getByTestId("tray-card-priority")).toHaveTextContent("High");
    await expect
      .element(review.getByTestId("tray-card-due"))
      .toHaveTextContent("Due Nov 20, 2026, 2:30 PM");
    await expect.element(review.getByTestId("tray-card-status")).not.toBeInTheDocument();
  });

  it("Rows name their status once more than one status is in progress", async () => {
    await renderTrayCard({ projects: [PROJECT], configure: markTesting });

    await expect
      .element(rowFor(TESTING).getByTestId("tray-card-status"))
      .toHaveTextContent("Testing");

    await expect
      .element(rowFor(REVIEW).getByTestId("tray-card-status"))
      .toHaveTextContent("In progress");
  });

  it("Rows keep the server's order, most urgent first", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => store.inProgress.urgency.set(itemNamed(store, OUTAGE).id, "Overdue"),
    });
    await expect.element(rowFor(REVIEW)).toBeVisible();

    const titles = titlesInOrder();

    expect(titles).toEqual([`INC-42${OUTAGE}`, REVIEW]);
    await expect.element(rowFor(OUTAGE).getByTestId("item-urgency")).toHaveTextContent("Overdue");
  });
});

describe("actions", () => {
  it("Clicking a row asks main to open the item in the main window", async () => {
    const { opened } = stubBridge();
    const { store } = await renderTrayCard({ projects: [PROJECT] });

    await openButton(`INC-42 ${OUTAGE}`).click();

    await expect.poll(() => opened).toEqual([itemNamed(store, OUTAGE).id]);
  });

  it("Reports the card's height so main can fit the window", async () => {
    const { heights } = stubBridge();
    await renderTrayCard({ projects: [PROJECT] });
    await expect.element(rowFor(REVIEW)).toBeVisible();

    const drawn = Math.ceil(card().element().getBoundingClientRect().height);

    await expect.poll(() => heights.at(-1)).toBe(drawn);
  });

  it("The circle asks about open sub-items under the row and completes on approval", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });

    await completeButton(REVIEW).click();

    const question = rowFor(REVIEW).getByRole("group", { name: "Complete sub-items" });
    await expect.element(question).toMatchTextContent("Also complete 2 open sub-items?");
    await question.getByRole("button", { name: "Complete" }).click();
    await expect.element(rowFor(REVIEW)).not.toBeInTheDocument();
    expect(itemNamed(store, REVIEW).completedAtUtc).not.toBeNull();
  });

  it("Cancel leaves the item open and listed", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await completeButton(REVIEW).click();

    await card().getByRole("button", { name: "Cancel" }).click();

    await expect.element(card().getByTestId("tray-card-confirmation")).not.toBeInTheDocument();
    await expect.element(rowFor(REVIEW)).toBeVisible();
    expect(itemNamed(store, REVIEW).completedAtUtc).toBeNull();
  });

  it("A blocked completion explains why under the row", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => {
        store.completionBlockedReason = "Finish the review checklist first.";
      },
    });

    await completeButton(`INC-42 ${OUTAGE}`).click();

    await expect
      .element(rowFor(OUTAGE).getByRole("alert"))
      .toHaveTextContent("Finish the review checklist first.");
  });

  it("Tab reaches each row's circle and text, and Enter opens the item", async () => {
    const { opened } = stubBridge();
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await expect.element(rowFor(REVIEW)).toBeVisible();
    (card().getByTestId("tray-card-pop-out").element() as HTMLElement).focus();

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => opened).toEqual([itemNamed(store, REVIEW).id]);
  });

  it("Showing the card again reads the stack again", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await expect.element(rowFor(REVIEW)).toBeVisible();
    markTesting(store);

    window.dispatchEvent(new Event("focus"));

    await expect.element(rowFor(TESTING)).toBeVisible();
  });
});

describe("pop out", () => {
  it("Pop out asks main to move the stack into its own window", async () => {
    const { poppedOut } = stubBridge();
    await renderTrayCard({ projects: [PROJECT] });

    await card().getByRole("button", { name: "Pop out" }).click();

    await expect.poll(() => poppedOut).toEqual([true]);
  });

  it("The popped-out window offers Keep on top instead of Pop out", async () => {
    stubBridge();
    await renderTrayCard({ projects: [PROJECT], layout: "window" });

    await expect.element(card().getByRole("button", { name: "Keep on top" })).toBeVisible();

    await expect.element(card().getByRole("button", { name: "Pop out" })).not.toBeInTheDocument();
    await expect.element(rowFor(REVIEW)).toBeVisible();
  });

  it("Keep on top toggles main's setting and is remembered", async () => {
    const { onTop } = stubBridge();
    await renderTrayCard({ projects: [PROJECT], layout: "window" });
    const toggle = card().getByRole("button", { name: "Keep on top" });
    await expect.poll(() => onTop.at(-1)).toBe(false);

    await toggle.click();

    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    expect(onTop.at(-1)).toBe(true);
    expect(localStorage.getItem("task-tracker.in-progress-on-top")).toBe("true");
    await toggle.click();
    await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("A remembered Keep on top choice is applied when the window opens", async () => {
    const { onTop } = stubBridge();
    localStorage.setItem("task-tracker.in-progress-on-top", "true");

    await renderTrayCard({ projects: [PROJECT], layout: "window" });

    await expect
      .element(card().getByRole("button", { name: "Keep on top" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(onTop.length).toBeGreaterThan(0);
    expect(onTop.every((value) => value)).toBe(true);
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  async function settle() {
    // Earlier tests leave the pointer over the header button; keep its hover out of the image.
    await userEvent.hover(card().getByTestId("tray-card-count"));
    useThemeStore.setState({ preference: theme });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  it("The card matches the baseline", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => {
        markTesting(store);
        store.inProgress.urgency.set(itemNamed(store, REVIEW).id, "Imminent");
      },
    });
    await expect.element(rowFor(TESTING)).toBeVisible();

    await settle();

    await expect.element(card()).toMatchScreenshot(`tray-card-${theme}`);
  });

  it("The empty card matches the baseline", async () => {
    await renderTrayCard({ projects: [{ name: "Ops", items: [{ title: QUEUED }] }] });
    await expect.element(card().getByTestId("tray-card-empty")).toBeVisible();

    await settle();

    await expect.element(card()).toMatchScreenshot(`tray-card-empty-${theme}`);
  });
});
