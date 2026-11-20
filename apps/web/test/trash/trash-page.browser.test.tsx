import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { MISSING_BATCH_MESSAGE, trashBatch } from "../support/fake-trash-handlers.js";
import { chooseMenuCommand } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const shortcut = () => userEvent.keyboard("{Control>}{Shift>}t{/Shift}{/Control}");
const back = () => page.getByRole("button", { name: "Back" });
const heading = () => page.getByRole("heading", { name: "Trash", exact: true });
const scope = () => page.getByRole("combobox", { name: "Trash scope" });
const empty = () => page.getByRole("button", { name: "Empty trash" });
const batch = (name: string) => page.getByRole("article", { name, exact: true });
const item = (name: string) => page.getByRole("treeitem", { name, exact: true });
const purge = (name: string) => batch(name).getByRole("button", { name: "Delete permanently" });

async function openWorkspace() {
  const app = await renderApp({
    projects: [{ name: "Billing", items: [{ title: "Current task" }] }, { name: "Archive" }],
    configure(store) {
      const billing = store.summaries[0]!.project.id;
      const archive = store.summaries[1]!.project.id;
      store.trash.add(trashBatch(1, billing, "Reconcile invoice"), () => {
        store.addItem(billing, null, { title: "Reconcile invoice" });
      });
      store.trash.add(trashBatch(2, archive, "Old note"));
    },
  });
  await page.getByRole("article", { name: "Billing" }).click();
  await expect.element(item("Current task")).toBeVisible();
  return app;
}

it("Uses exact shortcuts, opens from the sidebar, and returns Home", async () => {
  await renderApp();
  await expect
    .element(page.getByRole("heading", { name: "Projects", exact: true, level: 1 }))
    .toBeVisible();

  await userEvent.keyboard("{Control>}t{/Control}");
  await userEvent.keyboard("{Control>}{Shift>}{Alt>}t{/Alt}{/Shift}{/Control}");
  await expect.element(heading()).not.toBeInTheDocument();
  await shortcut();

  await expect.element(heading()).toBeVisible();
  await expect.element(scope()).not.toBeInTheDocument();
  await expect.element(page.getByText("The trash is empty.")).toBeVisible();
  await expect.element(empty()).toBeDisabled();
  await userEvent.keyboard("{Shift>}{Escape}{/Shift}");
  await expect.element(heading()).toBeVisible();
  await shortcut();
  await userEvent.keyboard("{Escape}");
  await expect.element(heading()).not.toBeInTheDocument();
  await chooseMenuCommand("view", "menu-trash");
  await expect.element(heading()).toBeVisible();
  await expect.element(page.getByTestId("sidebar-home")).toHaveAttribute("data-covered");
  await back().click();
  await expect.element(heading()).not.toBeInTheDocument();
  await expect.element(page.getByTestId("sidebar-home")).not.toHaveAttribute("data-covered");
});

it("Defaults to the originating folder's project and can widen the scope", async () => {
  await renderApp({
    projects: [{ name: "Billing", folders: [{ name: "Invoices" }] }, { name: "Archive" }],
    configure(store) {
      store.trash.add(trashBatch(1, store.summaries[0]!.project.id, "Invoice"));
      store.trash.add(trashBatch(2, store.summaries[1]!.project.id, "Old note"));
    },
  });
  await page.getByRole("article", { name: "Billing" }).click();
  await page
    .getByRole("treeitem", { name: "Invoices", exact: true })
    .getByTestId("folder-row")
    .first()
    .click();
  await expect.element(page.getByRole("heading", { name: "Invoices" })).toBeVisible();

  await shortcut();

  await expect.element(batch("Invoice")).toBeVisible();
  await expect.element(batch("Old note")).not.toBeInTheDocument();
  await expect.element(scope()).toHaveTextContent("This project");
  await scope().click();
  await page.getByRole("option", { name: "All projects" }).click();
  await expect.element(batch("Old note")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
});

it("Restores through RPC and refreshes the original workspace while retaining selection", async () => {
  const { store } = await openWorkspace();
  await item("Current task").getByTestId("item-title").first().click();
  await chooseMenuCommand("view", "menu-trash");
  await expect.element(batch("Reconcile invoice")).toBeVisible();

  const release = store.hold("RestoreTrashBatch");
  await batch("Reconcile invoice").getByRole("button", { name: "Restore" }).click();
  try {
    await expect.element(back()).toBeDisabled();
    await expect.element(empty()).toBeDisabled();
    await expect.element(scope()).toBeDisabled();
    await expect.element(purge("Reconcile invoice")).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect.element(heading()).toBeVisible();
    expect(store.calls.filter((tag) => tag === "RestoreTrashBatch")).toHaveLength(1);
  } finally {
    release();
  }

  await expect.element(page.getByText("The trash is empty.")).toBeVisible();
  await back().click();
  await expect.element(item("Reconcile invoice")).toBeVisible();
  await expect.element(item("Current task")).toHaveAttribute("aria-selected", "true");
  await shortcut();
  await userEvent.keyboard("{Control>}z{/Control}");
  await expect.element(batch("Reconcile invoice")).toBeVisible();
  await userEvent.keyboard("{Control>}y{/Control}");
  await expect.element(page.getByText("The trash is empty.")).toBeVisible();
});

it("Keeps a dirty editor while Trash is open and prompts once on the way back after restore", async () => {
  await openWorkspace();
  await item("Current task").getByTestId("item-title").first().click();
  await userEvent.keyboard("{Enter}");
  const title = page.getByTestId("item-editor-title");
  await title.fill("Draft task");

  await shortcut();
  await expect.element(batch("Reconcile invoice")).toBeVisible();
  await back().click();
  await expect.element(title).toHaveValue("Draft task");
  await shortcut();
  await batch("Reconcile invoice").getByRole("button", { name: "Restore" }).click();
  await expect.element(page.getByText("The trash is empty.")).toBeVisible();
  await back().click();

  const dialog = page.getByRole("alertdialog", { name: "Unsaved changes" });
  await expect.element(dialog).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(heading()).toBeVisible();
  await back().click();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect.element(title).toHaveValue("Current task");
});

it.each(["Delete permanently", "Empty trash"])(
  "%s defaults to Cancel and only performs the operation on confirmation",
  async (action) => {
    const { store } = await openWorkspace();
    await shortcut();
    await expect.element(batch("Reconcile invoice")).toBeVisible();
    const trigger = action === "Empty trash" ? empty() : purge("Reconcile invoice");
    const dialog = page.getByRole("alertdialog", { name: action });
    const tag = action === "Empty trash" ? "EmptyTrash" : "PurgeTrashBatch";

    await trigger.click();
    await expect.element(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await shortcut();
    await userEvent.keyboard("{Enter}");
    await expect.element(dialog).not.toBeInTheDocument();
    expect(store.calls).not.toContain(tag);

    await trigger.click();
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    expect(store.calls).not.toContain(tag);

    await trigger.click();
    await dialog.getByRole("button", { name: action }).click();
    await expect.element(page.getByText("The trash is empty.")).toBeVisible();
    expect(store.calls.filter((call) => call === tag)).toHaveLength(1);
    await scope().click();
    await page.getByRole("option", { name: "All projects" }).click();
    await expect.element(batch("Old note")).toBeVisible();
  },
);

it("Shows blocked restores and reports a stale batch or refused purge inline before refreshing", async () => {
  const app = await renderApp({
    projects: [{ name: "Billing" }],
    configure(store) {
      const id = store.summaries[0]!.project.id;
      store.trash.add(
        trashBatch(1, id, "Earlier", {
          restoreBlockedReason: "Restore the folder 'Invoices' first",
        }),
      );
      store.trash.add(trashBatch(2, id, "Invoices"));
      store.trash.add(trashBatch(3, id, "Gone"));
      store.trash.purgeRefusal = "'Earlier' still belongs to 'Invoices'.";
    },
  });
  await shortcut();
  await expect.element(batch("Earlier").getByRole("button", { name: "Restore" })).toBeDisabled();
  await expect
    .element(batch("Earlier").getByText("Restore the folder 'Invoices' first"))
    .toBeVisible();

  // Make "Gone" stale while the list is settled. A failed change reloads the
  // list with no visible sign, so removing it after one could hide the row first.
  app.store.trash.remove(trashBatch(3, "", "").batchId);
  await batch("Gone").getByRole("button", { name: "Restore" }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(MISSING_BATCH_MESSAGE);
  await expect.element(batch("Gone")).not.toBeInTheDocument();
  await purge("Invoices").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete permanently" }).click();

  await expect.element(page.getByRole("alert")).toHaveTextContent(app.store.trash.purgeRefusal!);
  await expect.element(batch("Invoices")).toBeVisible();
  app.store.trash.purgeRefusal = null;
  await purge("Earlier").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect.element(batch("Earlier")).not.toBeInTheDocument();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
});

it("Ignores a stale load after widening the scope or leaving Trash", async () => {
  const { store } = await openWorkspace();
  const release = store.hold("ListTrash");
  await shortcut();
  await expect.element(page.getByText("Loading trash…")).toBeVisible();
  await expect.element(page.getByText("The trash is empty.")).not.toBeInTheDocument();
  store.stopHolding("ListTrash");

  await scope().click();
  await page.getByRole("option", { name: "All projects" }).click();
  await expect.element(batch("Old note")).toBeVisible();
  release();
  await expect.element(batch("Old note")).toBeVisible();

  await back().click();
  const releaseAgain = store.hold("ListTrash");
  await shortcut();
  await back().click();
  releaseAgain();
  await expect.element(item("Current task")).toBeVisible();
  await expect.element(heading()).not.toBeInTheDocument();
});

it.each(THEMES)(
  "Shows the Trash list, confirmation, error and empty state in %s mode",
  async (theme) => {
    const { store } = await renderApp({
      projects: [{ name: "Billing" }],
      configure(store) {
        const id = store.summaries[0]!.project.id;
        store.trash.add(
          trashBatch(3, id, "Billing", {
            kind: "project",
            path: [],
            folderCount: 2,
            itemCount: 5,
            earlierBatchCount: 2,
          }),
        );
        store.trash.add(
          trashBatch(2, id, "Invoices", {
            kind: "folder",
            path: ["Billing", "Finance"],
            folderCount: 1,
            itemCount: 2,
            restoreBlockedReason: "Restore the project first",
          }),
        );
        store.trash.add(
          trashBatch(1, id, "Reconcile invoice", {
            path: ["Billing", "Finance", "Invoices"],
            restoreBlockedReason: "Restore the folder 'Invoices' first",
          }),
        );
        store.trash.purgeRefusal =
          "'Reconcile invoice' still belongs to 'Invoices'. Delete 'Reconcile invoice' permanently first.";
      },
    });
    const shell = page.getByTestId("app-shell");
    await shortcut();
    await expect.element(batch("Billing")).toBeVisible();
    await settleTheme(theme);
    await expect.element(shell).toMatchScreenshot(`trash-batches-${theme}`);

    await purge("Billing").click();
    const dialog = page.getByRole("alertdialog");
    await expect
      .element(dialog)
      .toHaveAccessibleDescription(/also deletes the 2 entries deleted from this project earlier/);
    await expect.element(dialog).toMatchScreenshot(`trash-confirmation-${theme}`);
    await userEvent.keyboard("{Escape}");

    await purge("Invoices").click();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await expect.element(page.getByRole("alert")).toBeVisible();
    await settleTheme(theme);
    await expect.element(shell).toMatchScreenshot(`trash-error-${theme}`);

    store.trash.purgeRefusal = null;
    await empty().click();
    await dialog.getByRole("button", { name: "Empty trash" }).click();
    await expect.element(page.getByText("The trash is empty.")).toBeVisible();
    await settleTheme(theme);
    await expect.element(shell).toMatchScreenshot(`trash-empty-${theme}`);
  },
);

async function openThreeBatches() {
  const app = await renderApp({
    projects: [{ name: "Billing" }],
    configure(store) {
      const id = store.summaries[0]!.project.id;
      store.trash.add(trashBatch(1, id, "Oldest"));
      store.trash.add(trashBatch(2, id, "Middle"));
      store.trash.add(trashBatch(3, id, "Newest"));
    },
  });
  await shortcut();
  await expect.element(batch("Oldest")).toBeVisible();
  return app;
}

it("Focuses the next row after a restore or purge, else the list", async () => {
  await openThreeBatches();
  const list = page.getByTestId("trash-list");

  await batch("Middle").getByRole("button", { name: "Restore" }).click();
  await expect.element(batch("Middle")).not.toBeInTheDocument();
  await expect.element(batch("Oldest")).toHaveFocus();
  await purge("Oldest").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect.element(batch("Oldest")).not.toBeInTheDocument();
  await expect.element(list).toHaveFocus();
  await batch("Newest").getByRole("button", { name: "Restore" }).click();

  await expect.element(page.getByText("The trash is empty.")).toBeVisible();
  await expect.element(list).toHaveFocus();
});

it("Keeps focus on the row while its change runs or after its confirmation is cancelled", async () => {
  const { store } = await openThreeBatches();
  const restore = batch("Middle").getByRole("button", { name: "Restore" });
  (restore.element() as HTMLElement).focus();

  const release = store.hold("RestoreTrashBatch");
  await userEvent.keyboard("{Enter}");
  try {
    await expect.element(restore).toBeDisabled();
    await expect.element(batch("Middle")).toHaveFocus();
  } finally {
    release();
  }
  await expect.element(batch("Oldest")).toHaveFocus();
  (purge("Newest").element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("alertdialog")).toBeVisible();
  await userEvent.keyboard("{Escape}");

  await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  await expect.element(batch("Newest")).toHaveFocus();
});

it("Keeps focus in Trash while Empty trash runs", async () => {
  await openThreeBatches();
  (empty().element() as HTMLElement).focus();

  await userEvent.keyboard("{Enter}");
  await page.getByRole("alertdialog").getByRole("button", { name: "Empty trash" }).click();

  await expect.element(page.getByText("The trash is empty.")).toBeVisible();
  await expect.element(page.getByTestId("trash-list")).toHaveFocus();
});
