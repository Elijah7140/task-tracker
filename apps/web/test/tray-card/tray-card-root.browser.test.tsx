import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderTrayCard } from "../support/render-tray-card.js";
import { useThemeStore } from "../../src/state/theme-store.js";
import { THEMES } from "../support/screenshots.js";

const REVIEW = "Review release notes";

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
          description: "Check the migration steps and the rollback plan before Friday.",
          children: [{ title: "Update changelog" }, { title: "Tag the build" }],
        },
      ],
    },
  ],
};

const card = () => page.getByRole("region", { name: "Current item" });
const completeButton = () => card().getByRole("button", { name: "Mark complete" });
const openButton = () => card().getByRole("button", { name: "Open in Task Tracker" });

function chooseReview(store: FakeProjectStore) {
  const views = store.folderNamed("Views");
  store.currentItem.itemId = store.findItemByTitle(views.projectId, views.id, REVIEW)!.item.id;
}

const reviewNode = (store: FakeProjectStore) => {
  const views = store.folderNamed("Views");
  return store.findItemByTitle(views.projectId, views.id, REVIEW)!;
};

/** Stands in for the preload bridge's tray card call. */
function stubBridge() {
  const opened: Array<string> = [];
  const heights: Array<number> = [];
  vi.stubGlobal("taskTrackerDesktop", {
    getRpcConnection: async () => undefined,
    openExternalLink: async () => false,
    openItemFromTrayCard: async (itemId: string) => {
      opened.push(itemId);
      return true;
    },
    reportTrayCardHeight: (height: number) => heights.push(height),
  });
  return { opened, heights };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("contents", () => {
  it("Without a current item the card explains how to choose one", async () => {
    await renderTrayCard({ projects: [PROJECT] });

    await expect.element(card().getByTestId("tray-card-empty")).toBeVisible();

    await expect
      .element(card())
      .toMatchTextContent(
        "No current item.Right-click an item in Task Tracker and choose Set as current item.",
      );
    await expect.element(openButton()).not.toBeInTheDocument();
  });

  it("Shows the title, area path, status, priority, due date and notes", async () => {
    await renderTrayCard({ projects: [PROJECT], configure: chooseReview });

    await expect.element(card().getByTestId("tray-card-title")).toHaveTextContent(REVIEW);

    await expect
      .element(card().getByTestId("tray-card-area"))
      .toHaveTextContent("Billing › dbo › Views");
    await expect.element(card().getByTestId("tray-card-status")).toHaveTextContent("In progress");
    await expect.element(card().getByTestId("tray-card-priority")).toHaveTextContent("High");
    await expect
      .element(card().getByTestId("tray-card-due"))
      .toHaveTextContent("Due Nov 20, 2026, 2:30 PM");
    await expect
      .element(card().getByTestId("tray-card-notes"))
      .toHaveTextContent("Check the migration steps and the rollback plan before Friday.");
    await expect.element(card().getByTestId("tray-card-completed")).not.toBeInTheDocument();
  });

  it("A deleted current item reads as no current item", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => {
        chooseReview(store);
        const node = reviewNode(store);
        store.deleteItem(node.item.projectId, node.item.folderId, node.item.id);
      },
    });

    await expect.element(card().getByTestId("tray-card-empty")).toBeVisible();
  });
});

describe("actions", () => {
  it("Open in Task Tracker asks main to open the item in the main window", async () => {
    const { opened } = stubBridge();
    const { store } = await renderTrayCard({ projects: [PROJECT], configure: chooseReview });

    await openButton().click();

    await expect.poll(() => opened).toEqual([reviewNode(store).item.id]);
  });

  it("Reports the card's height so main can fit the window", async () => {
    const { heights } = stubBridge();
    await renderTrayCard({ projects: [PROJECT], configure: chooseReview });
    await expect.element(card().getByTestId("tray-card-notes")).toBeVisible();

    const drawn = Math.ceil(card().element().getBoundingClientRect().height);

    await expect.poll(() => heights.at(-1)).toBe(drawn);
  });

  it("Mark complete asks about open sub-items inside the card and completes on approval", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT], configure: chooseReview });

    await completeButton().click();

    const question = card().getByRole("group", { name: "Complete sub-items" });
    await expect.element(question).toMatchTextContent("Also complete 2 open sub-items?");
    await question.getByRole("button", { name: "Complete" }).click();
    await expect.element(card().getByTestId("tray-card-completed")).toHaveTextContent("Completed");
    await expect.element(completeButton()).not.toBeInTheDocument();
    expect(reviewNode(store).item.completedAtUtc).not.toBeNull();
  });

  it("Cancel leaves the item open", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT], configure: chooseReview });
    await completeButton().click();

    await card().getByRole("button", { name: "Cancel" }).click();

    await expect.element(card().getByTestId("tray-card-confirmation")).not.toBeInTheDocument();
    expect(reviewNode(store).item.completedAtUtc).toBeNull();
    expect(store.calls.filter((call) => call === "SetItemCompleted")).toHaveLength(1);
  });

  it("A blocked completion explains why inside the card", async () => {
    const { store } = await renderTrayCard({
      projects: [{ name: "Ops", items: [{ title: REVIEW }] }],
      configure: (fake) => {
        fake.currentItem.itemId = fake.findItemByTitle(
          fake.summaries[0]!.project.id,
          null,
          REVIEW,
        )!.item.id;
        fake.completionBlockedReason = "Finish the review checklist first.";
      },
    });

    await completeButton().click();

    await expect
      .element(card().getByRole("alert"))
      .toHaveTextContent("Finish the review checklist first.");
    expect(store.currentItem.itemId).not.toBeNull();
  });

  it("Showing the card again reads the current item again", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await expect.element(card().getByTestId("tray-card-empty")).toBeVisible();
    chooseReview(store);

    window.dispatchEvent(new Event("focus"));

    await expect.element(card().getByTestId("tray-card-title")).toHaveTextContent(REVIEW);
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  async function settle() {
    useThemeStore.setState({ preference: theme });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  it("The card matches the baseline", async () => {
    await renderTrayCard({ projects: [PROJECT], configure: chooseReview });
    await expect.element(card().getByTestId("tray-card-notes")).toBeVisible();

    await settle();

    await expect.element(card()).toMatchScreenshot(`tray-card-${theme}`);
  });

  it("The empty card matches the baseline", async () => {
    await renderTrayCard({ projects: [PROJECT] });
    await expect.element(card().getByTestId("tray-card-empty")).toBeVisible();

    await settle();

    await expect.element(card()).toMatchScreenshot(`tray-card-empty-${theme}`);
  });
});
