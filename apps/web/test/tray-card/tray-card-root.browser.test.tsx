import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeItemNode } from "../support/fake-area-items.js";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderTrayCard } from "../support/render-tray-card.js";
import { useThemeStore } from "../../src/state/theme-store.js";
import { THEMES } from "../support/screenshots.js";

const REVIEW = "Review release notes";
const OUTAGE = "Investigate outage";
const OUTAGE_LABEL = `INC-42 ${OUTAGE}`;
const QUEUED = "Write the retrospective";
const TESTING = "Verify the hotfix";
const CHANGELOG = "Update changelog";
const TAG = "Tag the build";

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
          notes: "Check the **summary** first.",
          children: [{ title: CHANGELOG }, { title: TAG }],
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

/** The project with the review due imminently, as its area reports it. */
const URGENT_PROJECT: SeedProject = {
  ...PROJECT,
  folders: (PROJECT.folders ?? []).map((folder) => ({
    ...folder,
    items: (folder.items ?? []).map((item) => ({ ...item, urgency: "Imminent" as const })),
  })),
};

const trayCard = () => page.getByRole("region", { name: "In progress" });
const cards = () => trayCard().getByTestId("tray-card-item");
/** The tray card of an item: its caption, its workspace card and anything shown under it. */
const cardFor = (label: string) =>
  cards().filter({ has: page.getByRole("tree", { name: label, exact: true }) });
const cardTree = (label: string) => trayCard().getByRole("tree", { name: label, exact: true });
const outlineRow = (label: string, title: string) =>
  cardTree(label).getByRole("treeitem", { name: title, exact: true });
const addLine = (label: string) => cardTree(label).getByTestId("card-add-input");

function allNodes(store: FakeProjectStore): Array<FakeItemNode> {
  const visit = (nodes: ReadonlyArray<FakeItemNode>): Array<FakeItemNode> =>
    nodes.flatMap((node) => [node, ...visit(node.children)]);
  return store.allAreas().flatMap((area) => visit(area.nodes));
}

function nodeNamed(store: FakeProjectStore, title: string) {
  const found = allNodes(store).find((node) => node.item.title === title);
  if (found === undefined) {
    throw new Error(`No item named ${title}.`);
  }
  return found;
}

const itemNamed = (store: FakeProjectStore, title: string) => nodeNamed(store, title).item;

const childTitles = (store: FakeProjectStore, title: string) =>
  nodeNamed(store, title).children.map((child) => child.item.title);

function markTesting(store: FakeProjectStore) {
  const testing = store.statuses.rows.find((row) => row.name === "Testing")!;
  store.statuses.replace(testing.id, { isInProgress: true });
}

function cardLabelsInOrder() {
  return trayCard()
    .getByRole("tree")
    .elements()
    .map((tree) => tree.getAttribute("aria-label"));
}

/** Stands in for the preload bridge's tray card calls. */
function stubBridge() {
  const opened: Array<string> = [];
  const sizes: Array<{ readonly width: number; readonly height: number }> = [];
  const holds: Array<boolean> = [];
  const poppedOut: Array<true> = [];
  const onTop: Array<boolean> = [];
  vi.stubGlobal("taskTrackerDesktop", {
    getRpcConnection: async () => undefined,
    openExternalLink: async () => false,
    openItemFromTrayCard: async (itemId: string) => {
      opened.push(itemId);
      return true;
    },
    reportTrayCardSize: (width: number, height: number) => sizes.push({ width, height }),
    holdTrayCardOpen: (hold: boolean) => holds.push(hold),
    popOutTrayCard: async () => {
      poppedOut.push(true);
      return true;
    },
    setInProgressWindowOnTop: async (value: boolean) => {
      onTop.push(value);
      return value;
    },
  });
  return { opened, sizes, holds, poppedOut, onTop };
}

/** Collects the announcements other windows reload on (§7.18). */
function listenForDataChanges() {
  const heard: Array<unknown> = [];
  const channel = new BroadcastChannel("task-tracker:data-changed");
  channel.onmessage = (event) => heard.push(event.data);
  return { heard, close: () => channel.close() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("task-tracker.in-progress-on-top");
});

describe("contents", () => {
  it("With nothing in progress the card explains how items get there", async () => {
    await renderTrayCard({ projects: [{ name: "Ops", items: [{ title: QUEUED }] }] });

    await expect.element(trayCard().getByTestId("tray-card-empty")).toBeVisible();

    await expect
      .element(trayCard().getByTestId("tray-card-empty"))
      .toMatchTextContent(
        "Nothing in progress.Set an item's status to In progress. App Settings chooses which statuses count as in progress.",
      );
    await expect.element(trayCard().getByTestId("tray-card-count")).toHaveTextContent("0");
  });

  it("Shows every open ToDo and ticket with an in-progress status as a workspace card", async () => {
    await renderTrayCard({ projects: [PROJECT] });

    await expect.element(cardTree(REVIEW)).toBeVisible();

    await expect.element(cardTree(OUTAGE_LABEL)).toBeVisible();
    await expect.element(trayCard().getByText(QUEUED)).not.toBeInTheDocument();
    await expect.element(trayCard().getByText(TESTING)).not.toBeInTheDocument();
    await expect.element(trayCard().getByTestId("tray-card-count")).toHaveTextContent("2");
  });

  it("A card has the workspace header, notes, outline and add line under its area", async () => {
    await renderTrayCard({ projects: [PROJECT] });
    const review = cardFor(REVIEW);

    await expect
      .element(review.getByTestId("tray-card-area"))
      .toHaveTextContent("Billing › dbo › Views");

    await expect.element(review.getByTestId("item-status-chip")).toHaveTextContent("In progress");
    await expect
      .element(review.getByTestId("item-date").first())
      .toHaveTextContent("Nov 20, 2026, 2:30 PM");
    await expect
      .element(review.getByTestId("item-card-notes"))
      .toHaveTextContent("Check the summary first.");
    await expect.element(outlineRow(REVIEW, CHANGELOG)).toBeVisible();
    await expect.element(outlineRow(REVIEW, TAG)).toBeVisible();
    await expect.element(addLine(REVIEW)).toBeVisible();
    await expect
      .element(cardFor(OUTAGE_LABEL).getByTestId("item-ticket"))
      .toHaveTextContent("INC-42");
  });

  it("Tray cards offer no menus, drags or add dialogs", async () => {
    await renderTrayCard({ projects: [PROJECT] });
    await expect.element(outlineRow(REVIEW, CHANGELOG)).toBeVisible();

    await outlineRow(REVIEW, CHANGELOG).getByTestId("item-title").click({ button: "right" });

    await expect.element(page.getByTestId("item-context-menu")).not.toBeInTheDocument();
    await expect.element(trayCard().getByTestId("item-menu")).not.toBeInTheDocument();
    await expect.element(trayCard().getByTestId("item-card-actions")).not.toBeInTheDocument();
    await expect.element(trayCard().getByTestId("item-drag-handle")).not.toBeInTheDocument();
  });

  it("Cards keep the server's order, most urgent first", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => store.inProgress.urgency.set(itemNamed(store, OUTAGE).id, "Overdue"),
    });
    await expect.element(cardTree(REVIEW)).toBeVisible();

    const labels = cardLabelsInOrder();

    expect(labels).toEqual([OUTAGE_LABEL, REVIEW]);
  });
});

describe("settings", () => {
  it("Full cards draw a card 400 pixels wide", async () => {
    await renderTrayCard({ projects: [PROJECT] });
    await expect.element(cardTree(REVIEW)).toBeVisible();

    const width = trayCard().element().getBoundingClientRect().width;

    expect(width).toBe(400);
    await expect.element(trayCard()).toHaveAttribute("data-size", "Full");
  });

  it("Compact cards draw a narrower card with everything smaller", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => {
        store.settingsAndLookups.setGlobalSettings({
          trayCard: { size: "Compact", showItems: true },
        });
      },
    });
    await expect.element(trayCard()).toHaveAttribute("data-size", "Compact");
    await expect.element(cardTree(REVIEW)).toBeVisible();

    const width = trayCard().element().getBoundingClientRect().width;
    const title = cardTree(REVIEW).getByTestId("item-title").first().element();

    expect(width).toBe(300);
    expect(title.getBoundingClientRect().height).toBeLessThan(19);
    await expect.element(outlineRow(REVIEW, CHANGELOG)).toBeVisible();
  });

  it("Without items a card keeps its header and notes but hides the outline and add line", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => {
        store.settingsAndLookups.setGlobalSettings({
          trayCard: { size: "Full", showItems: false },
        });
      },
    });
    await expect.element(cardTree(REVIEW)).toBeVisible();

    await expect.element(cardFor(REVIEW).getByTestId("item-card-notes")).toBeVisible();

    await expect.element(outlineRow(REVIEW, CHANGELOG)).not.toBeInTheDocument();
    await expect.element(addLine(REVIEW)).not.toBeInTheDocument();
    await expect.element(cardTree(REVIEW).getByTestId("item-completion")).toBeVisible();
  });
});

describe("checking off", () => {
  it("Checking an outline row completes that sub-item and keeps the card", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    const events = listenForDataChanges();

    await outlineRow(REVIEW, CHANGELOG)
      .getByRole("button", { name: `Complete ${CHANGELOG}`, exact: true })
      .click();

    await expect.element(cardTree(REVIEW).getByText("1 completed")).toBeVisible();
    expect(itemNamed(store, CHANGELOG).completedAtUtc).not.toBeNull();
    expect(itemNamed(store, REVIEW).completedAtUtc).toBeNull();
    await expect.poll(() => events.heard.length).toBeGreaterThan(0);
    events.close();
  });

  it("The card's circle asks about open sub-items under the card and completes on approval", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });

    await cardTree(REVIEW)
      .getByRole("button", { name: `Complete ${REVIEW}`, exact: true })
      .click();

    const question = cardFor(REVIEW).getByRole("group", { name: "Complete sub-items" });
    await expect
      .element(question)
      .toMatchTextContent(`Also complete 2 open sub-items of ${REVIEW}?`);
    await question.getByRole("button", { name: "Complete" }).click();
    await expect.element(cardTree(REVIEW)).not.toBeInTheDocument();
    expect(itemNamed(store, REVIEW).completedAtUtc).not.toBeNull();
  });

  it("Cancel leaves the item open and on the card", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await cardTree(REVIEW)
      .getByRole("button", { name: `Complete ${REVIEW}`, exact: true })
      .click();

    await trayCard().getByRole("button", { name: "Cancel" }).click();

    await expect.element(trayCard().getByTestId("tray-card-confirmation")).not.toBeInTheDocument();
    await expect.element(cardTree(REVIEW)).toBeVisible();
    expect(itemNamed(store, REVIEW).completedAtUtc).toBeNull();
  });

  it("A blocked completion explains why under the card", async () => {
    await renderTrayCard({
      projects: [PROJECT],
      configure: (store) => {
        store.completionBlockedReason = "Finish the review checklist first.";
      },
    });

    await cardTree(OUTAGE_LABEL)
      .getByRole("button", { name: `Complete ${OUTAGE}`, exact: true })
      .click();

    await expect
      .element(cardFor(OUTAGE_LABEL).getByTestId("tray-card-message"))
      .toHaveTextContent("Finish the review checklist first.");
  });
});

describe("adding and notes", () => {
  it("Enter on the add line adds a ToDo as the card's last child and keeps typing", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    const events = listenForDataChanges();
    await addLine(REVIEW).click();

    await userEvent.keyboard("Publish the notes{Enter}");

    await expect.element(outlineRow(REVIEW, "Publish the notes")).toBeVisible();
    await expect.element(addLine(REVIEW)).toHaveValue("");
    await expect.element(addLine(REVIEW)).toHaveFocus();
    expect(childTitles(store, REVIEW)).toEqual([CHANGELOG, TAG, "Publish the notes"]);
    await expect.poll(() => events.heard.length).toBeGreaterThan(0);
    events.close();
  });

  it("Shift+Enter on the add line adds a ToDo under the card's last open child", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await addLine(REVIEW).click();

    await userEvent.keyboard("Sign the tag{Shift>}{Enter}{/Shift}");

    await expect.element(outlineRow(REVIEW, "Sign the tag")).toBeVisible();
    expect(childTitles(store, TAG)).toEqual(["Sign the tag"]);
  });

  it("A row's + adds the next item with Enter and a sub-item with Shift+Enter", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await outlineRow(REVIEW, CHANGELOG).hover();

    await outlineRow(REVIEW, CHANGELOG).getByTestId("item-inline-add").click();
    await userEvent.keyboard("Proofread{Enter}");
    await expect.element(outlineRow(REVIEW, "Proofread")).toBeVisible();
    await userEvent.keyboard("Check links{Shift>}{Enter}{/Shift}");

    await expect.element(outlineRow(REVIEW, "Check links")).toBeVisible();
    expect(childTitles(store, REVIEW)).toEqual([CHANGELOG, "Proofread", TAG]);
    expect(childTitles(store, "Proofread")).toEqual(["Check links"]);
  });

  it("Notes edit inline and save once with Ctrl+Enter", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await cardFor(REVIEW).getByTestId("item-card-notes").click();
    const editor = cardFor(REVIEW).getByTestId("item-card-notes-editor");
    await expect.element(editor).toHaveFocus();

    await userEvent.keyboard("{Control>}{End}{/Control} Then the dates.");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await expect.element(editor).not.toBeInTheDocument();
    await expect
      .element(cardFor(REVIEW).getByTestId("item-card-notes"))
      .toHaveTextContent("Check the summary first. Then the dates.");
    expect(itemNamed(store, REVIEW).notes).toBe("Check the **summary** first. Then the dates.");
  });

  it("Holds the card open while a field has unsaved typing", async () => {
    const { holds } = stubBridge();
    await renderTrayCard({ projects: [PROJECT] });
    await addLine(REVIEW).click();

    await userEvent.keyboard("Draft");
    await expect.poll(() => holds.at(-1)).toBe(true);
    await userEvent.keyboard("{Escape}");

    await expect.element(addLine(REVIEW)).toHaveValue("");
    await expect.poll(() => holds.at(-1)).toBe(false);
  });
});

describe("opening and keyboard", () => {
  it("Open asks main to open the item in the main window", async () => {
    const { opened } = stubBridge();
    const { store } = await renderTrayCard({ projects: [PROJECT] });

    await trayCard()
      .getByRole("button", { name: `Open ${OUTAGE_LABEL} in Task Tracker` })
      .click();

    await expect.poll(() => opened).toEqual([itemNamed(store, OUTAGE).id]);
  });

  it("Double-clicking a card's header opens its item", async () => {
    const { opened } = stubBridge();
    const { store } = await renderTrayCard({ projects: [PROJECT] });

    await cardTree(REVIEW).getByTestId("item-card-header").dblClick();

    await expect.poll(() => opened).toEqual([itemNamed(store, REVIEW).id]);
  });

  it("Tab reaches each card, its circle and its add line, and Space completes", async () => {
    stubBridge();
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await expect.element(addLine(REVIEW)).toBeVisible();
    (trayCard().getByTestId("tray-card-pop-out").element() as HTMLElement).focus();

    await userEvent.tab();
    await expect
      .element(trayCard().getByRole("button", { name: `Open ${REVIEW} in Task Tracker` }))
      .toHaveFocus();
    await userEvent.tab();
    await expect.element(cardTree(REVIEW).getByRole("treeitem").first()).toHaveFocus();
    await userEvent.tab();
    await expect
      .element(cardTree(REVIEW).getByRole("button", { name: `Complete ${REVIEW}`, exact: true }))
      .toHaveFocus();
    await userEvent.tab();
    await expect.element(addLine(REVIEW)).toHaveFocus();
    await userEvent.keyboard("From the keyboard{Enter}");
    await expect.element(outlineRow(REVIEW, "From the keyboard")).toBeVisible();
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.keyboard(" ");

    await expect
      .element(cardFor(REVIEW).getByRole("group", { name: "Complete sub-items" }))
      .toBeVisible();
    expect(itemNamed(store, REVIEW).completedAtUtc).toBeNull();
  });

  it("Reports the card's width and the height its content needs", async () => {
    const { sizes } = stubBridge();
    await renderTrayCard({ projects: [PROJECT] });
    await expect.element(outlineRow(REVIEW, TAG)).toBeVisible();

    const drawn = trayCard().element().getBoundingClientRect();

    await expect
      .poll(() => sizes.at(-1))
      .toEqual({ width: Math.ceil(drawn.width), height: Math.ceil(drawn.height) });
  });

  it("Showing the card again reads the stack again", async () => {
    const { store } = await renderTrayCard({ projects: [PROJECT] });
    await expect.element(cardTree(REVIEW)).toBeVisible();
    markTesting(store);

    window.dispatchEvent(new Event("focus"));

    await expect.element(cardTree(TESTING)).toBeVisible();
  });
});

describe("pop out", () => {
  it("Pop out asks main to move the stack into its own window", async () => {
    const { poppedOut } = stubBridge();
    await renderTrayCard({ projects: [PROJECT] });

    await trayCard().getByRole("button", { name: "Pop out" }).click();

    await expect.poll(() => poppedOut).toEqual([true]);
  });

  it("The popped-out window offers Keep on top and lays the cards out in columns", async () => {
    stubBridge();
    await renderTrayCard({ projects: [PROJECT], layout: "window" });

    await expect.element(trayCard().getByRole("button", { name: "Keep on top" })).toBeVisible();

    await expect
      .element(trayCard().getByRole("button", { name: "Pop out" }))
      .not.toBeInTheDocument();
    await expect.element(cardTree(REVIEW)).toBeVisible();
    const list = trayCard().getByTestId("tray-card-list").element();
    expect(getComputedStyle(list).display).toBe("grid");
  });

  it("Keep on top toggles main's setting and is remembered", async () => {
    const { onTop } = stubBridge();
    await renderTrayCard({ projects: [PROJECT], layout: "window" });
    const toggle = trayCard().getByRole("button", { name: "Keep on top" });
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
      .element(trayCard().getByRole("button", { name: "Keep on top" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(onTop.length).toBeGreaterThan(0);
    expect(onTop.every((value) => value)).toBe(true);
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  async function settle() {
    // Earlier tests leave the pointer over the header button; keep its hover out of the image.
    await userEvent.hover(trayCard().getByTestId("tray-card-count"));
    useThemeStore.setState({ preference: theme });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  it("The card matches the baseline", async () => {
    await renderTrayCard({
      projects: [URGENT_PROJECT],
      configure: (store) => {
        markTesting(store);
        store.inProgress.urgency.set(itemNamed(store, REVIEW).id, "Imminent");
      },
    });
    await expect.element(cardTree(TESTING)).toBeVisible();
    await expect.element(outlineRow(REVIEW, TAG)).toBeVisible();

    await settle();

    await expect.element(trayCard()).toMatchScreenshot(`tray-card-${theme}`);
  });

  it("The empty card matches the baseline", async () => {
    await renderTrayCard({ projects: [{ name: "Ops", items: [{ title: QUEUED }] }] });
    await expect.element(trayCard().getByTestId("tray-card-empty")).toBeVisible();

    await settle();

    await expect.element(trayCard()).toMatchScreenshot(`tray-card-empty-${theme}`);
  });
});
