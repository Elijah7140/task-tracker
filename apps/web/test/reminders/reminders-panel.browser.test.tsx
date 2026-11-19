import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const DELIVERED_AT = "2026-11-13T12:00:00Z";
const bell = () => page.getByTestId("reminder-bell");
const panel = () => page.getByRole("dialog", { name: "Reminders" });
const rows = () => panel().getByTestId("reminder-row");
const row = (title: string) => panel().getByRole("group", { name: title });
const editor = () => page.getByRole("dialog", { name: "Edit item" });
const togglePanel = () => userEvent.keyboard("{Control>}{Shift>}r{/Shift}{/Control}");

const PROJECTS = [
  {
    name: "Operations",
    items: [
      { title: "Review invoices", dueDate: "2026-11-13" },
      { title: "Send the weekly report", dueDate: "2026-11-13" },
      {
        title: "Plan the release",
        dueDate: "2026-11-13",
        children: [{ title: "Write notes", completedAtUtc: "2026-11-12T10:00:00Z" }],
      },
    ],
  },
];

/** Delivers reminders for items by title, newest first, as the server's scheduler would. */
function deliver(store: FakeProjectStore, ...titles: string[]) {
  const projectId = store.summaries[0]!.project.id;
  const items = titles.map((title) => {
    const { item } = store.findItemByTitle(projectId, null, title)!;
    return { id: item.id, title, projectId, folderId: null };
  });
  store.reminders.deliver(items, "Operations", DELIVERED_AT);
}

async function openApp(...titles: string[]) {
  const app = await renderApp({
    projects: PROJECTS,
    configure: (store) => deliver(store, ...titles),
  });
  await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  return app;
}

async function openPanel() {
  await bell().click();
  await expect.element(panel()).toBeVisible();
}

describe("Reminders panel", () => {
  it("The bell shows the pending count and Ctrl+Shift+R toggles the panel", async () => {
    await openApp("Review invoices");
    await expect.element(bell()).toHaveAccessibleName("Reminders (1)");
    await expect.element(page.getByTestId("reminder-badge")).toHaveTextContent("1");

    await bell().click();

    await expect.element(panel()).toBeVisible();
    await expect.element(row("Review invoices")).toBeVisible();
    await togglePanel();
    await expect.element(panel()).not.toBeInTheDocument();
    await expect.element(bell()).toHaveFocus();
    await togglePanel();
    await expect.element(panel()).toBeVisible();
    await expect.element(panel().getByTestId("reminders-close")).toHaveFocus();
  });

  it("A reminder delivered while the panel is open appears at the top", async () => {
    const { store } = await openApp("Review invoices");
    await openPanel();

    deliver(store, "Send the weekly report");

    await expect.element(rows().nth(1)).toBeVisible();
    await expect.element(rows().first()).toMatchTextContent("Send the weekly report");
    await expect.element(bell()).toHaveAccessibleName("Reminders (2)");
  });

  it("Snoozing from the menu clears the count and records an undoable step", async () => {
    const { store } = await openApp("Review invoices");
    await openPanel();

    await row("Review invoices").getByRole("button", { name: "Snooze" }).click();
    await page.getByRole("menuitem", { name: "10 minutes" }).click();

    await expect.element(panel().getByTestId("reminders-empty")).toHaveTextContent("No reminders");
    await expect.element(bell()).toHaveAccessibleName("Reminders");
    await expect.element(panel().getByTestId("reminders-close")).toHaveFocus();
    const projectId = store.summaries[0]!.project.id;
    const itemId = store.findItemByTitle(projectId, null, "Review invoices")!.item.id;
    expect(store.reminders.snoozes).toEqual([{ itemId, option: "tenMinutes" }]);
    await userEvent.keyboard("{Escape}");
    await page.getByTestId("edit-menu-trigger").click();
    await expect
      .element(page.getByTestId("history-undo"))
      .toMatchTextContent("Undo: Snooze reminder for 'Review invoices'");
  });

  it("A refused snooze is explained and keeps the entry", async () => {
    const { store } = await openApp("Review invoices");
    store.reminders.snoozeRefusal = "This reminder has changed.";
    await openPanel();

    await row("Review invoices").getByRole("button", { name: "Snooze" }).click();
    await page.getByRole("menuitem", { name: "1 hour" }).click();

    const message = page.getByRole("alertdialog");
    await expect.element(message).toMatchTextContent("This reminder has changed.");
    await message.getByRole("button", { name: "OK" }).click();
    await expect.element(bell()).toHaveAccessibleName("Reminders (1)");
  });

  it("Open shows the item in the editor and closes the panel", async () => {
    const { history, store } = await openApp("Send the weekly report");
    await openPanel();

    await row("Send the weekly report").getByRole("button", { name: "Open" }).click();

    await expect.element(editor()).toBeVisible();
    await expect
      .element(editor().getByRole("textbox", { name: "Title" }))
      .toHaveValue("Send the weekly report");
    await expect.element(panel()).not.toBeInTheDocument();
    expect(history.location.pathname).toBe(`/projects/${store.summaries[0]!.project.id}`);
  });

  it("Mark complete completes the item and removes the entry", async () => {
    const { store } = await openApp("Review invoices", "Send the weekly report");
    await openPanel();

    await row("Send the weekly report").getByRole("button", { name: "Mark complete" }).click();

    await expect.element(rows()).toHaveLength(1);
    const projectId = store.summaries[0]!.project.id;
    expect(
      store.findItemByTitle(projectId, null, "Send the weekly report")?.item.completedAtUtc,
    ).not.toBeNull();
    await expect
      .element(row("Review invoices").getByRole("button", { name: "Open" }))
      .toHaveFocus();
  });

  it("Mark complete explains a blocked completion and keeps the entry", async () => {
    const { store } = await openApp("Review invoices");
    store.completionBlockedReason = "Choose a Done status first.";
    await openPanel();

    await row("Review invoices").getByRole("button", { name: "Mark complete" }).click();

    const message = page.getByRole("alertdialog", { name: "Cannot complete item" });
    await expect.element(message).toMatchTextContent("Choose a Done status first.");
    await message.getByRole("button", { name: "OK" }).click();
    await expect.element(rows()).toHaveLength(1);
  });

  it("Dismiss removes the entry and the badge without recording history", async () => {
    const { store } = await openApp("Review invoices", "Send the weekly report");
    await openPanel();

    await row("Review invoices").getByRole("button", { name: "Dismiss" }).click();

    await expect.element(rows()).toHaveLength(1);
    await expect.element(bell()).toHaveAccessibleName("Reminders (1)");
    await expect
      .element(row("Send the weekly report").getByRole("button", { name: "Open" }))
      .toHaveFocus();
    await row("Send the weekly report").getByRole("button", { name: "Dismiss" }).click();
    await expect.element(page.getByTestId("reminder-badge")).not.toBeInTheDocument();
    expect(store.calls).toContain("DismissReminder");
    expect(store.calls).not.toContain("SnoozeReminder");
  });

  it("Escape closes the snooze menu first, then the panel, returning focus to the bell", async () => {
    await openApp("Review invoices");
    await openPanel();
    const snooze = row("Review invoices").getByRole("button", { name: "Snooze" });
    await snooze.click();
    await expect.element(page.getByRole("menu")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
    await expect.element(panel()).toBeVisible();
    await expect.element(snooze).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(panel()).not.toBeInTheDocument();
    await expect.element(bell()).toHaveFocus();
  });

  it("Over Search, Escape closes the panel before it leaves Search", async () => {
    await openApp("Review invoices");
    await userEvent.keyboard("{Control>}f{/Control}");
    const searchHeading = page.getByRole("heading", { name: "Search", level: 1 });
    await expect.element(searchHeading).toBeVisible();
    await togglePanel();
    await expect.element(panel()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(panel()).not.toBeInTheDocument();
    await expect.element(searchHeading).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(searchHeading).not.toBeInTheDocument();
  });

  it("Ctrl+Shift+R does nothing while the item editor is open", async () => {
    const { history, store } = await openApp("Review invoices");
    history.push(`/projects/${store.summaries[0]!.project.id}`);
    await openPanel();
    await row("Review invoices").getByRole("button", { name: "Open" }).click();
    await expect.element(editor()).toBeVisible();

    await togglePanel();

    await expect.element(panel()).not.toBeInTheDocument();
    await expect.element(editor().getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it.each(THEMES)("Matches the panel with two reminders in %s", async (theme) => {
    await openApp("Review invoices", "Send the weekly report");
    await openPanel();
    await expect.element(rows()).toHaveLength(2);

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`reminders-panel-${theme}`);
  });
});
