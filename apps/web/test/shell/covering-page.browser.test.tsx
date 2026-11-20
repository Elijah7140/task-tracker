import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

type SeedItems = NonNullable<SeedProject["items"]>;

const item = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const projectHeading = () => page.getByRole("heading", { name: "Billing", level: 1 });
const trashHeading = () => page.getByRole("heading", { name: "Trash", exact: true });
const calendar = () => page.getByTestId("calendar-page");
const searchBack = () => page.getByTestId("search-back");
const moveDialog = () => page.getByRole("dialog", { name: "Move to area" });
const subItemDialog = () => page.getByRole("dialog", { name: "New sub-item" });
const shortcut = (key: string) => userEvent.keyboard(`{Control>}{Shift>}${key}{/Shift}{/Control}`);

async function openWorkspace(items: SeedItems = [{ title: "Report" }, { title: "Review" }]) {
  const app = await renderApp({
    projects: [{ name: "Billing", items, folders: [{ name: "Invoices" }] }],
  });
  await page.getByRole("article", { name: "Billing" }).click();
  await expect.element(item("Report")).toBeVisible();
  return app;
}

async function focusRow(title: string) {
  await item(title).getByTestId("item-row").click();
  await expect.element(item(title)).toHaveFocus();
}

/** Dispatches an auto-repeated key press from the focused element, as holding a key does. */
function repeatKey(
  key: string,
  modifiers: { readonly ctrlKey?: boolean; readonly shiftKey?: boolean },
) {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      ...modifiers,
      repeat: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

it("Ignores workspace shortcuts while a covering page is shown", async () => {
  await openWorkspace();
  await focusRow("Report");
  await shortcut("c");
  await expect.element(calendar()).toBeVisible();

  await shortcut("l");
  await shortcut("n");
  await userEvent.keyboard("{Control>}n{/Control}");

  await expect.element(moveDialog()).not.toBeInTheDocument();
  await expect.element(subItemDialog()).not.toBeInTheDocument();
  await expect.element(page.getByTestId("quick-add-input")).not.toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(item("Report")).toHaveFocus();
  await shortcut("l");
  await expect.element(moveDialog()).toBeVisible();
});

it("Ignores auto-repeated workspace shortcuts", async () => {
  await openWorkspace();
  await focusRow("Report");

  repeatKey("L", { ctrlKey: true, shiftKey: true });
  repeatKey("N", { ctrlKey: true, shiftKey: true });
  repeatKey("n", { ctrlKey: true });

  await expect.element(moveDialog()).not.toBeInTheDocument();
  await expect.element(subItemDialog()).not.toBeInTheDocument();
  await expect.element(item("Report")).toHaveFocus();
});

it("Focuses the heading of Trash and Calendar, and the text box of Search, when opened", async () => {
  await openWorkspace();
  await focusRow("Report");

  await shortcut("t");
  await expect.element(trashHeading()).toHaveFocus();
  await shortcut("c");
  await expect.element(page.getByTestId("calendar-title")).toHaveFocus();
  await userEvent.keyboard("{Control>}f{/Control}");

  await expect.element(page.getByTestId("search-input")).toHaveFocus();
});

it("Returns focus to the previously focused row after Back and Escape", async () => {
  await openWorkspace();
  await focusRow("Review");

  await shortcut("t");
  await page.getByTestId("trash-back").click();
  await expect.element(item("Review")).toHaveFocus();
  await shortcut("c");
  await userEvent.keyboard("{Escape}");
  await expect.element(item("Review")).toHaveFocus();
  await userEvent.keyboard("{Control>}f{/Control}");
  await searchBack().click();

  await expect.element(item("Review")).toHaveFocus();
});

it("Keeps the original focus target when switching between covering pages", async () => {
  await openWorkspace();
  await focusRow("Review");

  await shortcut("c");
  await shortcut("t");
  await userEvent.keyboard("{Control>}f{/Control}");
  await userEvent.keyboard("{Escape}");

  await expect.element(item("Review")).toHaveFocus();
});

it("Falls back to the selected row when nothing had focus before opening", async () => {
  await openWorkspace();
  await focusRow("Review");
  await projectHeading().click();
  expect(document.activeElement).toBe(document.body);

  await shortcut("t");
  await page.getByTestId("trash-back").click();

  await expect.element(item("Review")).toHaveFocus();
});

it("Returns focus to the selected card after a calendar move reloads the workspace", async () => {
  await openWorkspace([{ title: "Report", dueDate: "2026-11-18" }, { title: "Review" }]);
  await focusRow("Report");
  await shortcut("c");
  const entry = page.getByRole("button", { name: /^Report,/ });
  await expect.element(entry).toBeVisible();
  (entry.element() as HTMLElement).focus();
  await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
  await expect.element(entry).toHaveAttribute("data-date", "2026-11-19");
  await expect.element(entry).toHaveFocus();

  await userEvent.keyboard("{Escape}");

  await expect.element(calendar()).not.toBeInTheDocument();
  await expect.element(item("Report")).toHaveFocus();
  await expect.element(item("Report")).toHaveAttribute("aria-selected", "true");
});

it("Keeps Calendar open while the page behind redirects after undoing a folder", async () => {
  const { history, store } = await openWorkspace();
  await page.getByTestId("sidebar-new-folder").click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("Drafts");
  await page.getByRole("button", { name: "Create" }).click();
  const drafts = page.getByRole("treeitem", { name: "Drafts", exact: true });
  await drafts.getByTestId("folder-row").first().click();
  await expect.element(page.getByRole("heading", { name: "Drafts", level: 1 })).toBeVisible();
  await shortcut("c");
  await expect.element(calendar()).toBeVisible();

  await userEvent.keyboard("{Control>}z{/Control}");

  await expect.element(drafts).not.toBeInTheDocument();
  const projectPath = `/projects/${store.summaries[0]!.project.id}`;
  await expect.poll(() => history.location.pathname).toBe(projectPath);
  await expect.element(calendar()).toBeVisible();
  await page.getByTestId("calendar-back").click();
  await expect.element(projectHeading()).toBeVisible();
  await expect.element(item("Report")).toBeVisible();
});

it("Leaves a covering page when a sidebar folder is opened", async () => {
  await openWorkspace();
  await shortcut("t");
  await expect.element(trashHeading()).toBeVisible();

  await page
    .getByRole("treeitem", { name: "Invoices", exact: true })
    .getByTestId("folder-row")
    .first()
    .click();

  await expect.element(trashHeading()).not.toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Invoices", level: 1 })).toBeVisible();
});
