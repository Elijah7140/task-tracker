import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
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

  it("Renames a focused item with F2 and validates blank names", async () => {
    await openRoot([{ name: "Billing DB", items: [{ title: "Draft task" }] }]);
    await focusRow("Draft task");

    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveValue("Draft task");
    await userEvent.keyboard("Final task{Enter}");

    await expect.element(row("Final task")).toBeVisible();

    await focusRow("Final task");
    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await userEvent.keyboard("   {Enter}");

    await expect
      .element(page.getByRole("alertdialog", { name: "Item action failed" }))
      .toHaveAccessibleDescription("Item title is required and must be at most 300 characters.");
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
    await row("Parent").getByTestId("item-toggle").first().click();
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

    await row("Task").getByTestId("item-row").first().click({ button: "right" });
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

    await expect.element(row(PARENT)).not.toBeInTheDocument();
    await page
      .getByRole("treeitem", { name: "Views", exact: true })
      .getByTestId("folder-row")
      .click();
    const viewsTree = page.getByRole("tree", { name: "Items in Views" });
    await expect.element(viewsTree.getByRole("treeitem", { name: PARENT })).toBeVisible();

    await viewsTree
      .getByRole("treeitem", { name: PARENT })
      .getByTestId("item-toggle")
      .first()
      .click();
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

    await focusRow("First");
    await userEvent.keyboard("{Tab}");
    await expect.element(row("First")).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await expect.element(row("First")).toHaveFocus();
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

    await expect
      .element(page.getByRole("alertdialog", { name: "Item action failed" }))
      .toHaveAccessibleDescription("Item is missing or deleted.");
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

    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await expect.element(row("First")).toHaveFocus();
    expect(store.areaSiblingTitles(projectId, null)).toEqual(["First", "Finished", "Last"]);

    await row("First").getByTestId("item-toggle").first().click();
    await focusRow("Sub B");
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

    await expect.element(row("Sub B")).toHaveFocus();
    const first = store.findItemByTitle(projectId, null, "First")!;
    expect(store.areaSiblingTitles(projectId, null, first.item.id)).toEqual(["Sub B", "Sub A"]);
  });

  it("Reorders open siblings downward and upward via pointer drag while preserving finished slots", async () => {
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

    await userEvent.dragAndDrop(
      row("Alpha").getByTestId("item-drag-handle").first(),
      row("Gamma").getByTestId("item-row").first(),
    );

    expect(store.areaSiblingTitles(projectId, null)).toEqual(["Beta", "Done", "Gamma", "Alpha"]);

    await userEvent.dragAndDrop(
      row("Gamma").getByTestId("item-drag-handle").first(),
      row("Beta").getByTestId("item-row").first(),
    );

    expect(store.areaSiblingTitles(projectId, null)).toEqual(["Gamma", "Done", "Beta", "Alpha"]);

    await row("Alpha").getByTestId("item-toggle").first().click();
    await userEvent.dragAndDrop(
      row("Child 1").getByTestId("item-drag-handle").first(),
      row("Child 2").getByTestId("item-row").first(),
    );

    const alpha = store.findItemByTitle(projectId, null, "Alpha")!;
    expect(store.areaSiblingTitles(projectId, null, alpha.item.id)).toEqual(["Child 2", "Child 1"]);
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
      await row(PARENT).getByTestId("item-toggle").first().click();
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
