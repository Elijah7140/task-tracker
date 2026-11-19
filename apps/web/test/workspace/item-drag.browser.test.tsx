import type {} from "@vitest/browser-playwright";
import { expect, it, onTestFinished } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { useWorkspaceStore } from "../../src/state/workspace-store.js";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const row = (name: string) => page.getByRole("treeitem", { name, exact: true });
const surface = (name: string) => row(name).getByTestId("item-row").first();
const folder = () => row("Destination").getByTestId("folder-row");
const title = () => page.getByTestId("item-editor-title");

const project: SeedProject = {
  name: "Project",
  folders: [{ name: "Destination", items: [{ title: "Elsewhere" }] }],
  items: [
    { title: "First", children: [{ title: "Child" }] },
    { title: "Second" },
    { title: "Third" },
  ],
};

async function openWorkspace(seed = project) {
  const app = await renderApp({ projects: [seed] });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  return { ...app, projectId, destination: app.store.folders[0]?.id };
}

function point(element: Element, vertical = 0.5) {
  const rect = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  return {
    x: Math.round((frame?.left ?? 0) + rect.left + rect.width / 2),
    y: Math.round((frame?.top ?? 0) + rect.top + rect.height * vertical),
  };
}

type Point = ReturnType<typeof point>;
const mouse = (
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  at: Point,
  buttons: number,
  button: "left" | "right" | "none" = "none",
) => cdp().send("Input.dispatchMouseEvent", { ...at, type, buttons, button, clickCount: 1 });

async function beginDrag(source: Element, target: Point) {
  const from = point(source);
  await mouse("mouseMoved", from, 0);
  await mouse("mousePressed", from, 1, "left");
  onTestFinished(async () => {
    await mouse("mouseReleased", target, 0, "left");
  });
  await mouse("mouseMoved", target, 1);
}

const drop = (source: string, target: string, vertical = 0.5) =>
  userEvent.dragAndDrop(surface(source), surface(target), {
    targetPosition: {
      x: 180,
      y: Math.floor(surface(target).element().getBoundingClientRect().height * vertical),
    },
  });

it("A row press with less than four pixels of horizontal movement still selects the row", async () => {
  const { store } = await openWorkspace();
  const from = point(surface("Second").element());

  await beginDrag(surface("Second").element(), { ...from, x: from.x + 3 });
  await mouse("mouseReleased", { ...from, x: from.x + 3 }, 0, "left");

  await expect.element(row("Second")).toHaveAttribute("aria-selected", "true");
  expect(store.calls).not.toContain("DropItem");
});

it("An extra mouse button on a row cannot start a drag from empty space", async () => {
  const { store } = await openWorkspace();
  const from = { x: point(surface("Second").element()).x, y: 700 };
  const target = point(surface("First").element());

  await mouse("mouseMoved", from, 0);
  await mouse("mousePressed", from, 1, "left");
  await mouse("mouseMoved", point(surface("Second").element()), 1);
  await mouse("mousePressed", point(surface("Second").element()), 3, "right");
  await mouse("mouseMoved", target, 3);
  await mouse("mouseReleased", target, 1, "right");
  await mouse("mouseReleased", target, 0, "left");

  await expect.element(page.getByTestId("drop-indicator")).not.toBeInTheDocument();
  expect(store.calls).not.toContain("DropItem");
});

it("An extra button leaves the original source active and Escape cancels the gesture", async () => {
  const { store } = await openWorkspace();
  const target = point(surface("First").element());
  const other = point(surface("Third").element());

  await beginDrag(surface("Second").element(), target);
  await mouse("mouseMoved", other, 1);
  await mouse("mousePressed", other, 3, "right");

  await expect.element(surface("Second")).toHaveAttribute("data-dragging", "true");
  await expect.element(surface("Third")).not.toHaveAttribute("data-dragging");
  await mouse("mouseReleased", other, 1, "right");
  await userEvent.keyboard("{Escape}");
  await mouse("mouseReleased", target, 0, "left");

  await expect.element(surface("Second")).not.toHaveAttribute("data-dragging");
  await expect.element(page.getByTestId("drop-indicator")).not.toBeInTheDocument();
  expect(store.calls).not.toContain("DropItem");
});

it("Rows scrolled out above the viewport cannot receive drops", async () => {
  const { store } = await openWorkspace({
    ...project,
    items: Array.from({ length: 40 }, (_, index) => ({ title: `Item ${index + 1}` })),
  });
  const main = page.getByRole("main").element();
  main.scrollTop = main.scrollHeight;
  const last = surface("Item 40").element();
  const start = point(last);
  const above = { ...start, y: -5 };

  await beginDrag(last, { ...start, y: start.y - 40 });
  await mouse("mouseMoved", above, 1);
  await expect.element(last).toHaveAttribute("data-dragging", "true");
  await expect.element(page.getByTestId("drop-indicator")).not.toBeInTheDocument();
  await mouse("mouseReleased", above, 0, "left");

  expect(main.scrollTop).toBeGreaterThan(20);
  expect(store.calls).not.toContain("DropItem");
});

it("Drops at either edge of a finished row have no effect, but into reopens it", async () => {
  const { store, projectId } = await openWorkspace({
    ...project,
    items: [{ title: "Open" }, { title: "Done", completedAtUtc: "2026-11-12T10:00:00Z" }],
  });
  await page.getByTestId("completed-section-toggle").click();
  const before = point(surface("Done").element(), 0.15);

  await beginDrag(surface("Open").element(), before);
  await expect.element(page.getByTestId("drop-indicator")).not.toBeInTheDocument();
  await mouse("mouseReleased", before, 0, "left");
  await drop("Done", "Open", 0.85);
  expect(store.calls).not.toContain("DropItem");

  await drop("Open", "Done");

  await expect.element(row("Open")).toHaveAttribute("aria-level", "2");
  await expect.element(row("Open")).toHaveFocus();
  expect(store.findItemByTitle(projectId, null, "Done")?.item.completedAtUtc).toBeNull();
});

it("A completed source moved into an open row remains visible and focused", async () => {
  await openWorkspace({
    ...project,
    items: [
      { title: "Open", children: [{ title: "Still open" }] },
      { title: "Done", completedAtUtc: "2026-11-12T10:00:00Z" },
    ],
  });
  await page.getByTestId("completed-section-toggle").click();

  await drop("Done", "Open");

  await expect.element(row("Done")).toHaveAttribute("aria-selected", "true");
  await expect.element(row("Done")).toHaveFocus();
});

it("A descendant is an invalid target and a child can be promoted between roots", async () => {
  const { store, projectId } = await openWorkspace();
  await row("First").getByTestId("item-toggle").first().click();

  await drop("First", "Child");
  await drop("First", "Child", 0.85);
  expect(store.calls).not.toContain("DropItem");
  await drop("Child", "Second", 0.15);

  await expect.element(row("Child")).toHaveAttribute("aria-level", "1");
  await expect.element(row("Child")).toHaveFocus();
  expect(store.areaSiblingTitles(projectId, null)).toEqual(["First", "Child", "Second", "Third"]);
});

it("Folder drops move an entire root branch, while sub-items cannot drop on folders", async () => {
  const { store, projectId, destination } = await openWorkspace();
  await row("First").getByTestId("item-toggle").first().click();

  await userEvent.dragAndDrop(surface("Child"), folder());
  expect(store.calls).not.toContain("MoveItemToArea");

  await userEvent.dragAndDrop(surface("First"), folder());

  await expect.element(row("First")).toHaveFocus();
  await expect.element(page.getByRole("tree", { name: "Items in Destination" })).toBeVisible();
  expect(store.findItemByTitle(projectId, destination!, "Child")?.item.folderId).toBe(destination);

  await userEvent.dragAndDrop(surface("First"), page.getByTestId("sidebar-project-link"));

  await expect.element(page.getByRole("tree", { name: "Items in Project" })).toBeVisible();
  await expect.element(row("First")).toHaveFocus();
  expect(store.areaSiblingTitles(projectId, null)).toEqual(["Second", "Third", "First"]);
});

it("A sub-item dropped below the tree moves to the end of the top level", async () => {
  const { store, projectId } = await openWorkspace();
  await row("First").getByTestId("item-toggle").first().click();
  const tree = page.getByRole("tree", { name: "Items in Project" }).element();
  const below = {
    ...point(surface("Child").element()),
    y: tree.getBoundingClientRect().bottom + 80,
  };

  await beginDrag(surface("Child").element(), below);
  await expect
    .element(page.getByTestId("drop-indicator"))
    .toHaveAttribute("data-placement", "root-end");
  await mouse("mouseReleased", below, 0, "left");

  await expect.element(row("Child")).toHaveAttribute("aria-level", "1");
  await expect.element(row("Child")).toHaveFocus();
  expect(store.areaSiblingTitles(projectId, null)).toEqual(["First", "Second", "Third", "Child"]);
});

it("Ctrl+Shift+L moves the selected top-level item to the chosen area and follows it", async () => {
  const { store, destination } = await openWorkspace();
  row("Second").element().focus();

  await userEvent.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");
  const dialog = page.getByRole("dialog", { name: "Move to area" });
  await dialog.getByRole("radio", { name: "Destination" }).click();
  await dialog.getByRole("button", { name: "Move" }).click();

  const tree = page.getByRole("tree", { name: "Items in Destination" });
  await expect.element(tree.getByRole("treeitem", { name: "Second" })).toHaveFocus();
  expect(store.areaSiblingTitles(store.summaries[0]!.project.id, destination!)).toEqual([
    "Elsewhere",
    "Second",
  ]);
});

it("Ctrl+Shift+L does nothing for a selected sub-item", async () => {
  const { store } = await openWorkspace();
  await row("First").getByTestId("item-toggle").first().click();
  row("Child").element().focus();

  await userEvent.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");

  await expect.element(page.getByRole("dialog", { name: "Move to area" })).not.toBeInTheDocument();
  await expect.element(row("Child")).toHaveFocus();
  expect(store.calls).not.toContain("MoveItemToArea");
});

it("Alt arrows indent and outdent next to the parent and keep row focus", async () => {
  const { store, projectId } = await openWorkspace();
  row("Second").element().focus();

  await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
  await expect.element(row("Second")).toHaveAttribute("aria-level", "2");
  await expect.element(row("Second")).toHaveFocus();
  await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");

  await expect.element(row("Second")).toHaveAttribute("aria-level", "1");
  await expect.element(row("Second")).toHaveFocus();
  expect(store.areaSiblingTitles(projectId, null)).toEqual(["First", "Second", "Third"]);
});

it("Cancelling the dirty editor guard cancels the keyboard move and preserves the draft", async () => {
  const { store } = await openWorkspace();
  row("Second").element().focus();
  await userEvent.keyboard("{Enter}");
  await title().fill("Unsaved title");

  await userEvent.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");
  await page.getByTestId("draft-dialog-cancel").click();

  await expect.element(title()).toHaveValue("Unsaved title");
  expect(store.calls).not.toContain("MoveItemToArea");
});

it("New edits typed during a row move survive the reload and keep editor focus", async () => {
  const { store, projectId } = await openWorkspace();
  const release = store.hold("DropItem");
  onTestFinished(release);
  row("First").element().focus();

  await drop("Second", "First", 0.15);
  await expect.poll(() => store.calls.includes("DropItem")).toBe(true);
  row("First").element().focus();
  await userEvent.keyboard("{Enter}");
  await title().fill("Typed while saving");
  release();

  await expect
    .poll(() => store.areaSiblingTitles(projectId, null))
    .toEqual(["Second", "First", "Third"]);
  await expect.element(title()).toHaveValue("Typed while saving");
  await expect.element(title()).toHaveFocus();
  // The modal editor hides the tree from the accessibility tree, so read the selection directly.
  const first = store.findItemByTitle(projectId, null, "First")!.item.id;
  expect(useWorkspaceStore.getState().selectedItemId).toBe(first);
});

it("New edits to a moved row follow it to its new area with editor focus", async () => {
  const { store } = await openWorkspace();
  const release = store.hold("MoveItemToArea");
  onTestFinished(release);
  row("First").element().focus();

  await userEvent.dragAndDrop(surface("First"), folder());
  await expect.poll(() => store.calls.includes("MoveItemToArea")).toBe(true);
  await userEvent.keyboard("{Enter}");
  await title().fill("Typed while moving areas");
  release();

  await expect
    .element(page.getByRole("heading", { name: "Destination", exact: true }))
    .toBeVisible();
  await expect.element(title()).toHaveValue("Typed while moving areas");
  await expect.element(title()).toHaveFocus();
});

it("The second move is ignored while a drop saves", async () => {
  const { store, projectId } = await openWorkspace();
  const release = store.hold("DropItem");
  onTestFinished(release);

  await drop("Second", "First", 0.15);
  await expect.poll(() => store.calls.includes("DropItem")).toBe(true);
  await drop("Third", "Second", 0.15);
  release();

  // Pressing Third selected it, and that newer selection keeps focus after the first move.
  await expect.element(row("Third")).toHaveFocus();
  expect(store.calls.filter((call) => call === "DropItem")).toHaveLength(1);
  expect(store.areaSiblingTitles(projectId, null)).toEqual(["Second", "First", "Third"]);
});

it.each([false, true])(
  "A newer selection wins even when it returns to the moved row (%s)",
  async (returns) => {
    const { store, projectId } = await openWorkspace();
    const release = store.hold("DropItem");
    onTestFinished(release);

    await drop("Second", "Third", 0.85);
    await expect.poll(() => store.calls.includes("DropItem")).toBe(true);
    await expect.element(row("Second")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    if (returns) {
      await userEvent.keyboard("{ArrowDown}");
    }
    release();

    await expect
      .poll(() => store.areaSiblingTitles(projectId, null))
      .toEqual(["First", "Third", "Second"]);
    await expect.element(row(returns ? "Second" : "First")).toHaveFocus();
    await expect.element(row("Second")).toHaveAttribute("aria-selected", String(returns));
  },
);

it.each([false, true])(
  "A pending move leaves a newer route alone whether it fails or succeeds (%s)",
  async (fails) => {
    const { store, projectId } = await openWorkspace();
    const release = store.hold("DropItem");
    onTestFinished(release);

    await drop("Second", "First", 0.15);
    await expect.poll(() => store.calls.includes("DropItem")).toBe(true);
    await folder().click();
    await expect.element(row("Elsewhere")).toBeVisible();
    if (fails) {
      store.deleteItem(projectId, null, store.findItemByTitle(projectId, null, "Second")!.item.id);
    }
    release();

    await expect
      .poll(() => store.areaSiblingTitles(projectId, null))
      .toEqual(fails ? ["First", "Third"] : ["Second", "First", "Third"]);
    await expect.element(row("Elsewhere")).toBeVisible();
    await expect.element(page.getByTestId("item-move-error")).not.toBeInTheDocument();
  },
);

it("A stale drop in the current area reports the server's failure inline", async () => {
  const { store, projectId } = await openWorkspace();
  store.deleteItem(projectId, null, store.findItemByTitle(projectId, null, "Second")!.item.id);

  await drop("Second", "First", 0.15);

  await expect
    .element(page.getByTestId("item-move-error"))
    .toHaveTextContent("Item is missing or deleted.");
});

for (const theme of THEMES) {
  it(`Shows into, insertion edge and folder drop feedback in ${theme}`, async () => {
    await openWorkspace();
    await settleTheme(theme);
    const shell = page.getByTestId("app-shell");
    const middle = point(surface("First").element());
    const before = point(surface("First").element(), 0.15);
    const destination = point(folder().element());

    await beginDrag(surface("Second").element(), middle);
    await expect.element(page.getByText("Make sub-item", { exact: true })).toBeVisible();
    await expect.element(shell).toMatchScreenshot(`item-drop-into-${theme}`);
    await mouse("mouseMoved", before, 1);
    await expect
      .element(page.getByTestId("drop-indicator"))
      .toHaveAttribute("data-placement", "before");
    await expect.element(shell).toMatchScreenshot(`item-drop-edge-${theme}`);
    await mouse("mouseMoved", destination, 1);
    await expect.element(folder()).toHaveAttribute("data-drop-active", "true");
    await expect.element(shell).toMatchScreenshot(`item-drop-folder-${theme}`);
    await userEvent.keyboard("{Escape}");

    await expect.element(folder()).not.toHaveAttribute("data-drop-active");
  });
}
