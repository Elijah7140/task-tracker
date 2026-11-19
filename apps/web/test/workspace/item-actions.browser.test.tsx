import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { dialogStore } from "../../src/state/dialog-store.js";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";
import { createTestClock } from "../support/test-clock.js";
import { BILLING_PROJECT } from "../support/workspace-seed.js";

const PARENT = "Add index to Invoice.CustomerId";
const SECOND = "Investigate nightly export failure";

const itemsTree = () => page.getByRole("tree", { name: "Items in Billing DB" });
const row = (name: string) => itemsTree().getByRole("treeitem", { name, exact: true });
const quickAdd = () => page.getByTestId("quick-add-input");

/** Whether the row titled `first` is rendered above the row titled `second`. */
function rendersBefore(first: string, second: string) {
  const position = row(first).element().compareDocumentPosition(row(second).element());
  return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

async function openRoot(
  projects: ReadonlyArray<SeedProject> = [BILLING_PROJECT],
  clock?: ReturnType<typeof createTestClock>["clock"],
) {
  const app = await renderApp(clock === undefined ? { projects } : { projects, clock });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(quickAdd()).toBeVisible();
  return { ...app, projectId };
}

/** A top-level item's card surface, and its header, where a press starts a card drag (§7.17). */
const card = (name: string) => row(name).getByTestId("item-row").first();
const cardHeader = (name: string) => row(name).getByTestId("item-card-header").first();

/** A point on a card's header line, `fraction` of the way across it. */
function besideCard(name: string, fraction: number) {
  const { width } = card(name).element().getBoundingClientRect();
  return { x: Math.floor(width * fraction), y: 16 };
}

async function focusRow(name: string) {
  row(name).element().focus();
  await expect.element(row(name)).toHaveFocus();
}

describe("Item actions and reorder", () => {
  it("Quick-adds a top-level item on Enter, selects it, and keeps quick-add focused", async () => {
    const { store, projectId } = await openRoot([{ name: "Billing DB" }]);

    await quickAdd().click();
    await userEvent.keyboard("Create customer index{Enter}");

    await expect.element(row("Create customer index")).toHaveAttribute("aria-selected", "true");
    await expect.element(quickAdd()).toHaveValue("");
    await expect.element(quickAdd()).toHaveFocus();
    expect(store.areaSiblingTitles(projectId, null)).toEqual(["Create customer index"]);

    await userEvent.keyboard("Check query plan{Enter}");

    await expect.element(row("Check query plan")).toBeVisible();
    await expect.element(quickAdd()).toHaveFocus();
    expect(store.areaSiblingTitles(projectId, null)).toEqual([
      "Create customer index",
      "Check query plan",
    ]);
  });

  it("Quick-adds into the currently selected folder", async () => {
    const { store, projectId } = await openRoot([BILLING_PROJECT]);
    const views = store.folderNamed("Views");
    await page
      .getByRole("treeitem", { name: "Views", exact: true })
      .getByTestId("folder-row")
      .click();
    await expect.element(page.getByTestId("empty-area")).toBeVisible();

    await page.getByTestId("quick-add-input").click();
    await userEvent.keyboard("Drop deprecated view{Enter}");

    const viewsTree = page.getByRole("tree", { name: "Items in Views" });
    await expect
      .element(viewsTree.getByRole("treeitem", { name: "Drop deprecated view" }))
      .toBeVisible();
    await expect.element(page.getByTestId("empty-area")).not.toBeInTheDocument();
    expect(store.areaSiblingTitles(projectId, views.id)).toEqual(["Drop deprecated view"]);
  });

  it("Ignores empty or whitespace-only quick-add submissions", async () => {
    const { store } = await openRoot([BILLING_PROJECT]);
    const before = store.calls.filter((call) => call === "CreateItem").length;

    await quickAdd().click();
    await userEvent.keyboard("   {Enter}");

    expect(store.calls.filter((call) => call === "CreateItem").length).toBe(before);
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Focuses quick-add from anywhere in the workspace with Ctrl+N", async () => {
    await openRoot([BILLING_PROJECT]);
    await focusRow(PARENT);

    await userEvent.keyboard("{Control>}n{/Control}");

    await expect.element(quickAdd()).toHaveFocus();
  });

  it("Shows the server error and preserves the quick-add draft when a title is rejected", async () => {
    await openRoot([{ name: "Billing DB" }]);
    const overlong = "x".repeat(301);

    await quickAdd().fill(overlong);
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByRole("alertdialog", { name: "Item action failed" }))
      .toHaveAccessibleDescription("Item title is required and must be at most 300 characters.");
    await page.getByRole("button", { name: "OK" }).click();
    await expect.element(quickAdd()).toHaveValue(overlong);
  });

  it("Adds a sub-item with Ctrl+Shift+N, expands the parent, and focuses the new child", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Parent" }] }]);
    await focusRow("Parent");

    await userEvent.keyboard("{Control>}{Shift>}N{/Shift}{/Control}");
    await expect.element(page.getByRole("dialog", { name: "New sub-item" })).toBeVisible();
    await userEvent.keyboard("Child task{Enter}");

    await expect.element(row("Parent")).toHaveAttribute("aria-expanded", "true");
    await expect.element(row("Child task")).toHaveAttribute("aria-level", "2");
    await expect.element(row("Child task")).toHaveAttribute("aria-selected", "true");
    await expect.element(row("Child task")).toHaveFocus();
  });

  it("Adds a sub-item from the row overflow menu", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Parent" }] }]);

    await row("Parent").getByTestId("item-menu").first().click();
    await page.getByTestId("item-menu-add-subitem").click();
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await userEvent.keyboard("Nested task{Enter}");

    await expect.element(row("Nested task")).toHaveAttribute("aria-level", "2");
  });

  it("Completes and reopens a leaf item via click and Space", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Leaf task" }] }]);

    await row("Leaf task").getByTestId("item-completion").first().click();

    await expect
      .element(itemsTree().getByRole("treeitem", { name: "Completed (1)" }))
      .toBeVisible();
    await itemsTree().getByTestId("completed-section-toggle").first().click();
    await focusRow("Leaf task");

    await userEvent.keyboard(" ");

    await expect
      .element(itemsTree().getByRole("treeitem", { name: "Completed (1)" }))
      .not.toBeInTheDocument();
    await expect.element(row("Leaf task")).toBeVisible();
  });

  it("Returns a reopened item to its previous place among open siblings", async () => {
    await openRoot([
      {
        name: "Billing DB",
        items: [
          { title: "First" },
          { title: "Middle", completedAtUtc: "2026-11-12T10:00:00Z" },
          { title: "Last" },
        ],
      },
    ]);
    await itemsTree().getByTestId("completed-section-toggle").first().click();
    await focusRow("Middle");

    await userEvent.keyboard(" ");

    await expect.element(itemsTree().getByTestId("completed-section")).not.toBeInTheDocument();
    const rows = itemsTree().getByTestId("item-tree-item");
    await expect.element(rows.nth(0)).toHaveAccessibleName("First");
    await expect.element(rows.nth(1)).toHaveAccessibleName("Middle");
    await expect.element(rows.nth(2)).toHaveAccessibleName("Last");
  });

  it("Asks before completing a parent with open sub-items and obeys Cancel and Complete", async () => {
    await openRoot([
      {
        name: "Billing DB",
        items: [{ title: "Parent", children: [{ title: "Child one" }, { title: "Child two" }] }],
      },
    ]);
    await focusRow("Parent");

    await userEvent.keyboard(" ");
    await expect
      .element(page.getByRole("alertdialog", { name: "Complete sub-items" }))
      .toHaveAccessibleDescription("Also complete 2 open sub-items?");

    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    await expect.element(row("Parent")).toBeVisible();
    await expect
      .element(itemsTree().getByRole("treeitem", { name: "Completed (1)" }))
      .not.toBeInTheDocument();

    await focusRow("Parent");
    await userEvent.keyboard(" ");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(itemsTree().getByRole("treeitem", { name: "Completed (1)" }))
      .toBeVisible();
  });

  it("Refreshes stale completion confirmation when open sub-items change before approval", async () => {
    const { store, projectId } = await openRoot([
      {
        name: "Billing DB",
        items: [{ title: "Parent", children: [{ title: "Original" }] }],
      },
    ]);
    const parent = store.findItemByTitle(projectId, null, "Parent")!;
    const original = store.findItemByTitle(projectId, null, "Original")!;
    await focusRow("Parent");

    await userEvent.keyboard(" ");
    await expect
      .element(page.getByRole("alertdialog", { name: "Complete sub-items" }))
      .toHaveAccessibleDescription("Also complete 1 open sub-item?");

    store.completeItem(projectId, null, original.item.id, true);
    store.addItem(projectId, null, { title: "Replacement" }, parent.item.id);
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByRole("alertdialog", { name: "Complete sub-items" }))
      .toHaveAccessibleDescription("Open sub-items changed. Also complete 1 open sub-item?");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(itemsTree().getByRole("treeitem", { name: "Completed (1)" }))
      .toBeVisible();
  });

  it("Shows the blocked message when reopening a finished parent under auto-complete", async () => {
    await openRoot([
      {
        name: "Billing DB",
        items: [
          {
            title: "Finished parent",
            completedAtUtc: "2026-11-13T12:00:00Z",
            children: [{ title: "Finished child", completedAtUtc: "2026-11-13T12:00:00Z" }],
          },
        ],
      },
    ]);
    await itemsTree().getByTestId("completed-section-toggle").first().click();

    await row("Finished parent").getByTestId("item-completion").first().click();

    await expect
      .element(page.getByRole("alertdialog", { name: "Cannot reopen item" }))
      .toHaveAccessibleDescription("Reopen a sub-item instead, or add a new one.");
    await page.getByRole("button", { name: "OK" }).click();
    await expect.element(row("Finished parent")).toBeVisible();
  });

  it("Completes a parent without confirmation when auto-complete is off", async () => {
    await openRoot([
      {
        name: "Billing DB",
        autoCompleteParents: false,
        items: [{ title: "Parent", children: [{ title: "Open child" }] }],
      },
    ]);

    await row("Parent").getByTestId("item-completion").first().click();

    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    await expect
      .element(row("Parent").getByTestId("item-title").first())
      .toHaveClass(/line-through/);
  });

  it("Renames a focused item with F2 and validates blank and overlong names", async () => {
    const { store } = await openRoot([{ name: "Billing DB", items: [{ title: "Draft task" }] }]);
    await focusRow("Draft task");

    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveValue("Draft task");
    await userEvent.keyboard("Final task{Enter}");

    await expect.element(row("Final task")).toBeVisible();
    const edits = () => store.calls.filter((call) => call === "EditItem").length;
    expect(edits()).toBe(1);

    await focusRow("Final task");
    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await userEvent.keyboard("   {Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Enter a name.");
    await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
    await page.getByTestId("prompt-dialog-input").fill("x".repeat(301));
    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Name must be 300 characters or fewer.");
    expect(edits()).toBe(1);
  });

  it("Validates a new sub-item title before creating it", async () => {
    const { store } = await openRoot([{ name: "Billing DB", items: [{ title: "Parent" }] }]);
    await focusRow("Parent");

    await userEvent.keyboard("{Control>}{Shift>}N{/Shift}{/Control}");
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await userEvent.keyboard("   {Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Enter a name.");
    await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
    expect(store.calls).not.toContain("CreateItem");
  });

  it("Confirms deletion with Delete, supports Undo restore, and auto-dismisses the undo banner", async () => {
    const { advance, clock } = createTestClock();
    const { store } = await openRoot(
      [
        {
          name: "Billing DB",
          items: [{ title: "Parent", children: [{ title: "Child" }] }],
        },
      ],
      clock,
    );
    await focusRow("Parent");

    await userEvent.keyboard("{Delete}");
    await expect
      .element(page.getByRole("alertdialog", { name: "Delete item" }))
      .toHaveAccessibleDescription("Delete Parent and its sub-items?");
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    expect(store.calls).not.toContain("DeleteItem");
    await expect.element(row("Parent")).toBeVisible();

    await focusRow("Parent");
    await userEvent.keyboard("{Delete}");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByTestId("item-undo-banner")).toBeVisible();
    await expect.element(page.getByTestId("empty-area")).toBeVisible();

    await page.getByTestId("item-undo-button").click();

    await expect.element(row("Parent")).toBeVisible();
    await expect.element(row("Child")).toBeVisible();

    await focusRow("Parent");
    await userEvent.keyboard("{Delete}");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByTestId("item-undo-banner")).toBeVisible();

    await advance("10 seconds");

    await expect.element(page.getByTestId("item-undo-banner")).not.toBeInTheDocument();
  });

  it("Opens item actions via right-click context menu and Shift+F10", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Task" }] }]);

    await row("Task").getByTestId("item-title").first().click({ button: "right" });
    await expect.element(page.getByTestId("item-context-menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByTestId("item-context-menu")).not.toBeInTheDocument();

    await focusRow("Task");
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");

    await expect.element(page.getByTestId("item-menu-popup")).toBeVisible();
    await expect.element(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  });

  it("Moves a top-level item to another area and hides Move to area on sub-items", async () => {
    const { store } = await openRoot([BILLING_PROJECT]);

    await row(PARENT).getByTestId("item-menu").first().click();
    await page.getByTestId("item-menu-move-area").click();
    const dialog = page.getByRole("dialog", { name: "Move to area" });
    await dialog.getByRole("radio", { name: "Views" }).click();
    await dialog.getByRole("button", { name: "Move" }).click();

    const viewsTree = page.getByRole("tree", { name: "Items in Views" });
    await expect.element(viewsTree.getByRole("treeitem", { name: PARENT })).toBeVisible();

    await viewsTree
      .getByRole("treeitem", { name: "Check query plan before/after" })
      .getByTestId("item-menu")
      .first()
      .click();
    await expect.element(page.getByTestId("item-menu-move-area")).not.toBeInTheDocument();
    expect(store.calls).toContain("MoveItemToArea");
  });

  it("Moves an item under another item and reports cycle violations", async () => {
    await openRoot([
      {
        name: "Billing DB",
        items: [{ title: "Alpha", children: [{ title: "Nested" }] }, { title: "Beta" }],
      },
    ]);

    await row("Beta").getByTestId("item-menu").first().click();
    await page.getByTestId("item-menu-move-parent").click();
    const dialog = page.getByRole("dialog", { name: "Move item" });
    await dialog.getByRole("radio", { name: "Alpha" }).click();
    await dialog.getByRole("button", { name: "Move" }).click();

    await expect.element(row("Alpha")).toHaveAttribute("aria-expanded", "true");
    await expect.element(row("Beta")).toHaveAttribute("aria-level", "2");

    await row("Alpha").getByTestId("item-menu").first().click();
    await page.getByTestId("item-menu-move-parent").click();
    const cycleDialog = page.getByRole("dialog", { name: "Move item" });
    await cycleDialog.getByRole("radio", { name: "Nested" }).click();
    await cycleDialog.getByRole("button", { name: "Move" }).click();

    await expect
      .element(page.getByRole("alertdialog", { name: "Item action failed" }))
      .toHaveAccessibleDescription("Item move would create a cycle.");
  });

  it("Indents and outdents a focused item row with Tab and Shift+Tab while preserving focus", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "First" }, { title: "Second" }] }]);
    await focusRow("Second");

    await userEvent.keyboard("{Tab}");

    await expect.element(row("First")).toHaveAttribute("aria-expanded", "true");
    await expect.element(row("Second")).toHaveAttribute("aria-level", "2");
    await expect.element(row("Second")).toHaveFocus();

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

    await expect.element(row("Second")).toHaveAttribute("aria-level", "1");
    await expect.element(row("Second")).toHaveFocus();
  });

  it("Lets Tab and Shift+Tab leave a row that cannot be indented or outdented", async () => {
    const { store } = await openRoot([
      { name: "Billing DB", items: [{ title: "First" }, { title: "Second" }] },
    ]);
    await focusRow("First");

    await userEvent.keyboard("{Tab}");

    await expect.element(quickAdd()).toHaveFocus();

    await focusRow("First");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");

    await expect.element(page.getByTestId("workspace-project-settings")).toHaveFocus();
    expect(store.calls).not.toContain("IndentItem");
    expect(store.calls).not.toContain("OutdentItem");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Indents past a finished sibling onto the preceding open sibling and shows server errors", async () => {
    const { store, projectId } = await openRoot([
      {
        name: "Billing DB",
        items: [
          { title: "Open A" },
          { title: "Done B", completedAtUtc: "2026-11-12T10:00:00Z" },
          { title: "Open C" },
        ],
      },
    ]);
    await focusRow("Open C");

    await userEvent.keyboard("{Tab}");

    await expect.element(row("Open A")).toHaveAttribute("aria-expanded", "true");
    await expect.element(row("Open C")).toHaveAttribute("aria-level", "2");
    await expect.element(row("Open C")).toHaveFocus();

    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await expect.element(row("Open C")).toHaveAttribute("aria-level", "1");
    const openA = store.findItemByTitle(projectId, null, "Open A")!;
    store.deleteItem(projectId, null, openA.item.id);

    await focusRow("Open C");
    await userEvent.keyboard("{Tab}");

    // Outdent placed Open C straight after Open A, which the server no longer has.
    await expect
      .element(page.getByRole("alertdialog", { name: "Item action failed" }))
      .toHaveAccessibleDescription("The first sibling cannot be indented.");
  });

  it("Reorders top-level and nested open siblings with Alt+Up/Down while keeping finished slots", async () => {
    const { store, projectId } = await openRoot([
      {
        name: "Billing DB",
        items: [
          {
            title: "First",
            children: [{ title: "Sub A" }, { title: "Sub B" }],
          },
          { title: "Finished", completedAtUtc: "2026-11-12T10:00:00Z" },
          { title: "Last" },
        ],
      },
    ]);
    await focusRow("First");

    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

    await expect.element(row("First")).toHaveFocus();
    expect(store.areaSiblingTitles(projectId, null)).toEqual(["Last", "Finished", "First"]);
    // A reorder pressed before the saved order arrives is ignored, so wait for it.
    await expect.poll(() => rendersBefore("Last", "First")).toBe(true);

    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await expect.element(row("First")).toHaveFocus();
    await expect
      .poll(() => store.areaSiblingTitles(projectId, null))
      .toEqual(["First", "Finished", "Last"]);
    // Wait for the reload that restores focus to First before moving focus elsewhere.
    await expect.poll(() => rendersBefore("First", "Last")).toBe(true);

    await focusRow("Sub B");
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

    await expect.element(row("Sub B")).toHaveFocus();
    const first = store.findItemByTitle(projectId, null, "First")!;
    expect(store.areaSiblingTitles(projectId, null, first.item.id)).toEqual(["Sub B", "Sub A"]);
  });

  it("Reorders open cards and sub-items via pointer drag while preserving finished slots", async () => {
    const { store, projectId } = await openRoot([
      {
        name: "Billing DB",
        items: [
          { title: "Alpha", children: [{ title: "Child 1" }, { title: "Child 2" }] },
          { title: "Done", completedAtUtc: "2026-11-12T10:00:00Z" },
          { title: "Beta" },
          { title: "Gamma" },
        ],
      },
    ]);

    await userEvent.dragAndDrop(cardHeader("Alpha"), card("Gamma"), {
      targetPosition: besideCard("Gamma", 0.85),
    });

    expect(store.areaSiblingTitles(projectId, null)).toEqual(["Beta", "Done", "Gamma", "Alpha"]);

    await userEvent.dragAndDrop(cardHeader("Gamma"), card("Beta"), {
      targetPosition: besideCard("Beta", 0.15),
    });

    expect(store.areaSiblingTitles(projectId, null)).toEqual(["Gamma", "Done", "Beta", "Alpha"]);

    const childRow = row("Child 2").getByTestId("item-row").first();
    const { width, height } = childRow.element().getBoundingClientRect();
    await userEvent.dragAndDrop(row("Child 1").getByTestId("item-drag-handle").first(), childRow, {
      targetPosition: { x: Math.floor(width / 2), y: Math.floor(height * 0.85) },
    });

    const alpha = store.findItemByTitle(projectId, null, "Alpha")!;
    expect(store.areaSiblingTitles(projectId, null, alpha.item.id)).toEqual(["Child 2", "Child 1"]);
  });

  it("Focuses the next open sibling after completing an item with Space", async () => {
    await openRoot([
      { name: "Billing DB", items: [{ title: "First" }, { title: "Second" }, { title: "Third" }] },
    ]);
    await focusRow("Second");

    await userEvent.keyboard(" ");

    await expect.element(row("Third")).toHaveFocus();
    await expect.element(row("Third")).toHaveAttribute("aria-selected", "true");
  });

  it("Focuses the previous open sibling after completing the last item by click", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "First" }, { title: "Second" }] }]);

    await row("Second").getByTestId("item-completion").first().click();

    await expect.element(row("First")).toHaveFocus();
  });

  it("Focuses the parent after completing its only open sub-item", async () => {
    await openRoot([
      {
        name: "Billing DB",
        autoCompleteParents: false,
        items: [{ title: "Parent", children: [{ title: "Only child" }] }],
      },
    ]);
    await focusRow("Only child");

    await userEvent.keyboard(" ");

    await expect.element(row("Parent")).toHaveFocus();
  });

  it("Keeps focus on a completed parent that stays in the open list", async () => {
    await openRoot([
      {
        name: "Billing DB",
        autoCompleteParents: false,
        items: [{ title: "Parent", children: [{ title: "Open child" }] }, { title: "Next" }],
      },
    ]);
    await focusRow("Parent");

    await userEvent.keyboard(" ");

    await expect
      .element(row("Parent").getByTestId("item-title").first())
      .toHaveClass(/line-through/);
    await expect.element(row("Parent")).toHaveFocus();
  });

  it("Focuses quick-add after completing the last open item", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Only" }] }]);
    await focusRow("Only");

    await userEvent.keyboard(" ");

    await expect
      .element(itemsTree().getByRole("treeitem", { name: "Completed (1)" }))
      .toBeVisible();
    await expect.element(quickAdd()).toHaveFocus();
  });

  it("Focuses the next sibling after deleting and keeps Undo reachable by keyboard", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "First" }, { title: "Second" }] }]);
    await focusRow("First");

    await userEvent.keyboard("{Delete}");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(row("Second")).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    await expect.element(quickAdd()).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    await expect.element(page.getByTestId("item-undo-button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(row("First")).toBeVisible();
  });

  it("Focuses quick-add after deleting the last item in an area", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Only" }] }]);
    await focusRow("Only");

    await userEvent.keyboard("{Delete}");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByTestId("empty-area")).toBeVisible();
    await expect.element(quickAdd()).toHaveFocus();
  });

  it("Focuses the parent after deleting its only sub-item", async () => {
    await openRoot([
      { name: "Billing DB", items: [{ title: "Parent", children: [{ title: "Child" }] }] },
    ]);
    await focusRow("Child");

    await userEvent.keyboard("{Delete}");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(row("Parent")).toHaveFocus();
  });

  it("Follows an item moved to another area and focuses its row there", async () => {
    await openRoot([BILLING_PROJECT]);
    await focusRow(PARENT);

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await page.getByTestId("item-menu-move-area").click();
    const dialog = page.getByRole("dialog", { name: "Move to area" });
    await dialog.getByRole("radio", { name: "Views" }).click();
    await dialog.getByRole("button", { name: "Move" }).click();

    const viewsTree = page.getByRole("tree", { name: "Items in Views" });
    await expect.element(viewsTree.getByRole("treeitem", { name: PARENT })).toHaveFocus();
  });

  it("Reorders finished siblings with Alt+Up/Down within their own group", async () => {
    const { store, projectId } = await openRoot([
      {
        name: "Billing DB",
        items: [
          { title: "Open one" },
          { title: "Done A", completedAtUtc: "2026-11-12T10:00:00Z" },
          { title: "Open two" },
          { title: "Done B", completedAtUtc: "2026-11-12T11:00:00Z" },
        ],
      },
    ]);
    await itemsTree().getByTestId("completed-section-toggle").first().click();
    await focusRow("Done A");

    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

    await expect
      .poll(() => store.areaSiblingTitles(projectId, null))
      .toEqual(["Open one", "Done B", "Open two", "Done A"]);
    await expect.element(row("Done A")).toHaveFocus();

    // A reorder pressed before the saved order arrives is ignored, and Done A
    // cannot move above Done B twice, so repeat the key until it takes effect.
    await expect
      .poll(async () => {
        await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
        return store.areaSiblingTitles(projectId, null);
      })
      .toEqual(["Open one", "Done A", "Open two", "Done B"]);
    await expect.element(row("Done A")).toHaveFocus();
  });

  it("Ignores a second Space while completing a parent is in progress", async () => {
    const { store } = await openRoot([
      {
        name: "Billing DB",
        items: [{ title: "Parent", children: [{ title: "Child one" }] }],
      },
    ]);
    await focusRow("Parent");
    const release = store.hold("SetItemCompleted");

    await userEvent.keyboard("  ");
    release();

    await expect
      .element(page.getByRole("alertdialog", { name: "Complete sub-items" }))
      .toBeVisible();
    expect(dialogStore.getState().queue).toHaveLength(1);
    expect(store.calls.filter((call) => call === "SetItemCompleted")).toHaveLength(1);
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    await expect.poll(() => dialogStore.getState().queue).toHaveLength(0);
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed complete sub-items confirmation baseline", async () => {
      await openRoot([BILLING_PROJECT]);
      await focusRow(PARENT);
      await userEvent.keyboard(" ");
      await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`complete-subitems-dialog-${theme}`);
    });

    it("Matches the reviewed blocked reopen notice baseline", async () => {
      await openRoot([BILLING_PROJECT]);
      await focusRow("Check query plan before/after");
      await userEvent.keyboard(" ");
      await expect.element(row(PARENT)).not.toBeInTheDocument();
      await itemsTree().getByTestId("completed-section-toggle").last().click();
      await row(PARENT).getByTestId("item-completion").first().click();
      await expect
        .element(page.getByRole("alertdialog", { name: "Cannot reopen item" }))
        .toBeVisible();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`blocked-reopen-dialog-${theme}`);
    });

    it("Matches the reviewed move item area dialog baseline", async () => {
      await openRoot([BILLING_PROJECT]);
      await row(SECOND).getByTestId("item-menu").first().click();
      await page.getByTestId("item-menu-move-area").click();
      await expect.element(page.getByRole("dialog", { name: "Move to area" })).toBeVisible();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`move-item-dialog-${theme}`);
    });
  });
});
