import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const item = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const editMenu = () => page.getByRole("button", { name: "Edit", exact: true });
const status = () => page.getByTestId("history-status");
const undo = () => userEvent.keyboard("{Control>}z{/Control}");

async function openWorkspace() {
  const app = await renderApp({
    projects: [{ name: "Billing", items: [{ title: "Report" }, { title: "Review" }] }],
  });
  await page.getByRole("article", { name: "Billing" }).click();
  await expect.element(item("Report")).toBeVisible();
  return app;
}

it("Disables both Edit actions and silently ignores undo when history is empty", async () => {
  const { store } = await renderApp();

  await editMenu().click();
  await expect.element(page.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
  await expect.element(page.getByRole("menuitem", { name: "Redo" })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  await undo();

  expect(store.calls).not.toContain("ApplyHistory");
  await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
});

it("Replays completion using Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z", async () => {
  await openWorkspace();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard(" ");
  await expect.element(item("Completed (1)")).toBeVisible();

  await undo();
  await expect.element(item("Report")).toBeVisible();
  await expect.element(status()).toHaveTextContent("Undid: Complete 'Report'");
  await userEvent.keyboard("{Control>}y{/Control}");
  await expect.element(item("Completed (1)")).toBeVisible();
  await expect.element(status()).toHaveTextContent("Redid: Complete 'Report'");
  await undo();
  await expect.element(item("Report")).toBeVisible();
  await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

  await expect.element(item("Completed (1)")).toBeVisible();
  await expect.element(status()).toHaveTextContent("Redid: Complete 'Report'");
});

it("Keeps native text undo and ignores shortcuts while a prompt is open", async () => {
  const { store } = await openWorkspace();
  const quickAdd = page.getByTestId("quick-add-input");
  await quickAdd.click();
  await userEvent.keyboard("New task{Enter}");
  await expect.element(item("New task")).toBeVisible();
  await userEvent.keyboard("Draft text");

  await undo();

  await expect.element(quickAdd).toHaveValue("");
  expect(store.calls).not.toContain("ApplyHistory");
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard("{F2}");
  await expect.element(page.getByRole("dialog", { name: "Rename item" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard("{Delete}");
  await expect.element(page.getByRole("alertdialog", { name: "Delete item" })).toBeVisible();
  await undo();

  await expect.element(page.getByRole("alertdialog", { name: "Delete item" })).toBeVisible();
  expect(store.calls).not.toContain("ApplyHistory");
});

it("Preserves a dirty item editor after focus leaves its text fields", async () => {
  const { store } = await openWorkspace();
  await page.getByTestId("quick-add-input").click();
  await userEvent.keyboard("New task{Enter}");
  await expect.element(item("New task")).toBeVisible();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard("{Enter}");
  const title = page.getByTestId("item-editor-title");
  await title.fill("Draft report");
  page.getByTestId("item-editor-save").element().focus();

  await undo();

  const message = page.getByRole("alertdialog", { name: "Undo and redo" });
  await expect
    .element(message)
    .toHaveAccessibleDescription("Save or discard your item edits before undoing or redoing.");
  await message.getByRole("button", { name: "OK" }).click();
  await expect.element(title).toHaveValue("Draft report");
  expect(store.calls).not.toContain("ApplyHistory");
});

it("Blocks replay after leaving a pending lookup name in App Settings", async () => {
  const { store } = await openWorkspace();
  await page.getByTestId("quick-add-input").click();
  await userEvent.keyboard("New task{Enter}");
  await expect.element(item("New task")).toBeVisible();
  await page.getByTestId("sidebar-settings").click();
  const input = page.getByRole("textbox", { name: "New priority level name" });
  await input.fill("Draft priority");

  await editMenu().click();
  await page.getByRole("menuitem", { name: "Undo: Create 'New task'" }).click();

  const message = page.getByRole("alertdialog", { name: "Undo and redo" });
  await expect
    .element(message)
    .toHaveAccessibleDescription("Save or discard your settings before undoing or redoing.");
  await message.getByRole("button", { name: "OK" }).click();
  await expect.element(input).toHaveValue("Draft priority");
  expect(store.calls).not.toContain("ApplyHistory");
});

it("Preserves selection and focus through reorder replay and clears the outcome on navigation", async () => {
  await openWorkspace();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
  await expect
    .poll(
      () =>
        item("Review").element().compareDocumentPosition(item("Report").element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    )
    .toBeTruthy();

  await undo();

  await expect
    .poll(
      () =>
        item("Report").element().compareDocumentPosition(item("Review").element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    )
    .toBeTruthy();
  await expect.element(item("Report")).toHaveFocus();
  await expect.element(item("Report")).toHaveAttribute("aria-selected", "true");
  await expect.element(status()).toHaveTextContent("Undid: Move 'Report'");
  await page.getByTestId("sidebar-home").click();
  await expect.element(status()).not.toBeInTheDocument();
});

it.each(THEMES)(
  "Shows labelled Edit actions and the workspace outcome in %s mode",
  async (theme) => {
    await openWorkspace();
    await item("Report").getByTestId("item-title").first().click();
    await userEvent.keyboard(" ");
    await expect.element(item("Completed (1)")).toBeVisible();
    await settleTheme(theme);

    await editMenu().click();
    const undoAction = page.getByRole("menuitem", { name: "Undo: Complete 'Report'" });
    await expect.element(undoAction).toBeEnabled();
    await expect.element(page.getByRole("menu")).toMatchScreenshot(`edit-menu-${theme}`);
    await undoAction.click();

    await expect.element(item("Report")).toBeVisible();
    await expect.element(status()).toHaveTextContent("Undid: Complete 'Report'");
    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`workspace-history-${theme}`);
    await editMenu().click();
    await page.getByRole("menuitem", { name: "Redo: Complete 'Report'" }).click();
    await expect.element(item("Completed (1)")).toBeVisible();
  },
);

it("Clears selection and restores focus when undo removes the selected item", async () => {
  await openWorkspace();
  const quickAdd = page.getByTestId("quick-add-input");
  await quickAdd.click();
  await userEvent.keyboard("New task{Enter}");
  await item("New task").getByTestId("item-title").first().click();

  await undo();

  await expect.element(item("New task")).not.toBeInTheDocument();
  await expect.element(quickAdd).toHaveFocus();
  await expect.element(item("Report")).toHaveAttribute("aria-selected", "false");
});

it("Undoes a keyboard deletion and clears the batch notice", async () => {
  await openWorkspace();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard("{Delete}");
  await page
    .getByRole("alertdialog", { name: "Delete item" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect.element(page.getByTestId("item-undo-banner")).toBeVisible();

  await undo();

  await expect.element(item("Report")).toBeVisible();
  await expect.element(page.getByTestId("item-undo-banner")).not.toBeInTheDocument();
  await expect.element(status()).toHaveTextContent("Undid: Delete 'Report'");
});

it("Uses the same shortcuts on Home and reports stale data in a message dialog", async () => {
  const { store } = await renderApp({ projects: [{ name: "Billing" }] });
  await page.getByRole("article", { name: "Billing" }).getByRole("button").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Project name" }).fill("Accounts");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect.element(page.getByRole("article", { name: "Accounts" })).toBeVisible();

  store.historyRefusal = "This project changed since; can't undo.";
  await undo();

  const dialog = page.getByRole("alertdialog", { name: "Undo and redo" });
  await expect.element(dialog).toHaveAccessibleDescription(store.historyRefusal);
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect.element(page.getByRole("article", { name: "Accounts" })).toBeVisible();
  store.historyRefusal = null;
  await expect.element(dialog).not.toBeInTheDocument();
  await page.getByRole("heading", { name: "Projects", level: 1 }).click();
  await undo();
  await expect.element(page.getByRole("article", { name: "Billing" })).toBeVisible();
});

it("Clears a replay outcome after a newly recorded action", async () => {
  await openWorkspace();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard(" ");
  await expect.element(item("Completed (1)")).toBeVisible();
  await undo();
  await expect.element(status()).toHaveTextContent("Undid: Complete 'Report'");

  await page.getByTestId("quick-add-input").click();
  await userEvent.keyboard("New action{Enter}");

  await expect.element(item("New action")).toBeVisible();
  await expect.element(status()).not.toBeInTheDocument();
  await editMenu().click();
  await expect.element(page.getByRole("menuitem", { name: "Redo", exact: true })).toBeDisabled();
});

it("Restores a deleted project on Home and disables undo once its only action is undone", async () => {
  await renderApp({
    projects: [{ name: "Billing" }, { name: "Design" }],
  });
  const project = page.getByRole("article", { name: "Billing" });
  await project.getByRole("button").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete project" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect.element(project).not.toBeInTheDocument();

  await page.getByRole("heading", { name: "Projects", level: 1 }).click();
  await undo();

  await expect.element(project).toBeVisible();
  await editMenu().click();
  await expect.element(page.getByRole("menuitem", { name: "Undo", exact: true })).toBeDisabled();
  await expect
    .element(page.getByRole("menuitem", { name: "Redo: Delete 'Billing'" }))
    .toBeEnabled();
});

it("Refuses redo while App Settings holds an unsaved default", async () => {
  const { store } = await openWorkspace();
  await item("Report").getByTestId("item-title").first().click();
  await userEvent.keyboard(" ");
  await expect.element(item("Completed (1)")).toBeVisible();
  await undo();
  await expect.element(item("Report")).toBeVisible();
  await page.getByTestId("sidebar-settings").click();
  const defaultValue = page.getByTestId("global-yellow-amount");
  await defaultValue.fill("4");

  await editMenu().click();
  await page.getByRole("menuitem", { name: "Redo: Complete 'Report'" }).click();

  const message = page.getByRole("alertdialog", { name: "Undo and redo" });
  await expect
    .element(message)
    .toHaveAccessibleDescription("Save or discard your settings before undoing or redoing.");
  await message.getByRole("button", { name: "OK" }).click();
  await expect.element(defaultValue).toHaveValue("4");
  expect(store.calls.filter((call) => call === "ApplyHistory")).toHaveLength(1);
});

it("Shows stale-row refusals in the workspace and reports unexpected failures in a dialog", async () => {
  const { store } = await openWorkspace();
  await page.getByTestId("quick-add-input").click();
  await userEvent.keyboard("New task{Enter}");
  await item("New task").getByTestId("item-title").first().click();
  store.historyRefusal = "This item changed since; can't undo.";

  await undo();

  await expect.element(status()).toHaveTextContent(store.historyRefusal);
  await expect.element(item("New task")).toHaveFocus();
  store.historyRefusal = null;
  store.historyFailure = true;
  await undo();

  await expect
    .element(page.getByRole("alertdialog", { name: "Undo and redo failed" }))
    .toHaveAccessibleDescription("The operation could not be completed.");
});
