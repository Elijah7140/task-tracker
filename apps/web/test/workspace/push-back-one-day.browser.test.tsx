import type { RecurrenceRule } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedItem } from "../support/fake-area-items.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const weekly: typeof RecurrenceRule.Type = {
  frequency: "Weekly",
  interval: 1,
  weekdays: 32,
  monthDay: null,
  month: null,
  anchor: "DueDate",
  endKind: "Never",
  endDate: null,
  remaining: null,
};

const ITEMS: ReadonlyArray<SeedItem> = [
  {
    title: "Overdue report",
    dueDate: "2026-11-10",
    dueTime: "15:30:00",
    scheduledStart: "2026-11-10T23:45:00",
    scheduledEnd: "2026-11-11T01:45:00",
    children: [{ title: "Gather figures", dueDate: "2026-11-10" }],
  },
  { title: "Someday" },
  { title: "Weekly sync", dueDate: "2026-11-13", recurrence: weekly },
];

const UNDATED_REASON = "This item has no due date or scheduled block.";

const item = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const pushBackItem = () => page.getByRole("menuitem", { name: "Push back one day" });
const shortcut = () => userEvent.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");

async function openWorkspace() {
  const app = await renderApp({ projects: [{ name: "Ops", items: ITEMS }] });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(item("Overdue report")).toBeVisible();
  const stored = (title: string) => app.store.findItemByTitle(projectId, null, title)?.item;
  const pushBacks = () => app.store.calls.filter((call) => call === "PushBackOneDay").length;
  return { ...app, projectId, stored, pushBacks };
}

async function openMenu(title: string) {
  await item(title).getByTestId("item-title").first().click({ button: "right" });
}

async function select(title: string) {
  await item(title).getByTestId("item-title").first().click();
}

/** Dispatches an auto-repeated Ctrl+Shift+P from the focused element, as holding the keys does. */
function repeatShortcut() {
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "P",
      ctrlKey: true,
      shiftKey: true,
      repeat: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("Push back one day in the workspace", () => {
  it("Moves a card's due date and block one day and leaves its sub-item", async () => {
    const { stored, pushBacks } = await openWorkspace();

    await openMenu("Overdue report");
    await pushBackItem().click();

    await expect.poll(() => stored("Overdue report")?.dueDate).toBe("2026-11-11");
    expect(stored("Overdue report")).toMatchObject({
      dueTime: "15:30:00",
      scheduledStart: "2026-11-11T23:45:00",
      scheduledEnd: "2026-11-12T01:45:00",
    });
    expect(stored("Gather figures")?.dueDate).toBe("2026-11-10");
    expect(pushBacks()).toBe(1);
    await expect.element(item("Overdue report")).toMatchTextContent("Nov 11, 2026, 3:30 PM");
  });

  it("Records one undo step named after the item", async () => {
    const { stored } = await openWorkspace();
    await openMenu("Overdue report");
    await pushBackItem().click();
    await expect.poll(() => stored("Overdue report")?.dueDate).toBe("2026-11-11");

    await page.getByTestId("edit-menu-trigger").click();
    await page.getByRole("menuitem", { name: "Undo: Push back 'Overdue report'" }).click();

    await expect.poll(() => stored("Overdue report")?.dueDate).toBe("2026-11-10");
  });

  it("Pushes back a sub-item from the keyboard menu and returns focus to its row", async () => {
    const { stored } = await openWorkspace();
    await select("Gather figures");

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await expect.element(pushBackItem()).toBeVisible();
    await pushBackItem().click();

    await expect.poll(() => stored("Gather figures")?.dueDate).toBe("2026-11-11");
    expect(stored("Overdue report")?.dueDate).toBe("2026-11-10");
    await expect.element(item("Gather figures")).toHaveFocus();
  });

  it("Shows the action disabled with the reason for an undated item", async () => {
    const { pushBacks } = await openWorkspace();

    await openMenu("Someday");

    await expect.element(pushBackItem()).toHaveAttribute("aria-disabled", "true");
    await expect.element(pushBackItem()).toHaveAccessibleDescription(UNDATED_REASON);
    await expect.element(pushBackItem()).toHaveAttribute("aria-keyshortcuts", "Control+Shift+P");
    await userEvent.hover(pushBackItem(), { force: true });
    await expect
      .element(page.getByTestId("item-menu-push-back-reason"))
      .toHaveTextContent(UNDATED_REASON);
    await pushBackItem().click({ force: true });
    expect(pushBacks()).toBe(0);
  });

  it("Moves only this occurrence of a repeating item and keeps its rule", async () => {
    const { stored } = await openWorkspace();

    await openMenu("Weekly sync");
    await pushBackItem().click();

    await expect.poll(() => stored("Weekly sync")?.dueDate).toBe("2026-11-14");
    expect(stored("Weekly sync")?.recurrence).toEqual(weekly);
    await expect.element(item("Weekly sync").getByTestId("repeat-marker").first()).toBeVisible();
  });

  it("Shows the server's reason when the item can no longer move", async () => {
    const { store, stored, pushBacks } = await openWorkspace();
    store.patchItem(stored("Overdue report")!.id, { completedAtUtc: "2026-11-15T10:00:00Z" });

    await openMenu("Overdue report");
    await pushBackItem().click();

    const message = page.getByRole("alertdialog", { name: "Push back one day" });
    await expect
      .element(message)
      .toHaveAccessibleDescription("Completed items cannot be pushed back.");
    expect(pushBacks()).toBe(1);
    expect(stored("Overdue report")?.dueDate).toBe("2026-11-10");
  });
});

describe("Ctrl+Shift+P", () => {
  it("Pushes back the selected row once while the keys are held", async () => {
    const { stored, pushBacks } = await openWorkspace();
    await select("Overdue report");

    await shortcut();
    repeatShortcut();
    repeatShortcut();

    await expect.poll(() => stored("Overdue report")?.dueDate).toBe("2026-11-11");
    expect(pushBacks()).toBe(1);
  });

  it("Leaves text boxes and undated items alone", async () => {
    const { pushBacks } = await openWorkspace();
    await select("Someday");
    await shortcut();
    await select("Overdue report");
    await page.getByTestId("quick-add-input").click();

    await shortcut();

    await expect.element(page.getByTestId("quick-add-input")).toHaveFocus();
    expect(pushBacks()).toBe(0);
  });

  it("Asks about an unsaved editor draft before pushing back the open item", async () => {
    const { store, stored, pushBacks } = await openWorkspace();
    await select("Overdue report");
    await userEvent.keyboard("{Enter}");
    await page.getByTestId("item-editor-title").fill("Overdue report edited");
    const prompt = page.getByRole("alertdialog", { name: "Unsaved changes" });
    (page.getByTestId("item-editor-close").element() as HTMLElement).focus();

    await shortcut();
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await expect.element(prompt).not.toBeInTheDocument();

    expect(pushBacks()).toBe(0);
    await expect
      .element(page.getByTestId("item-editor-title"))
      .toHaveValue("Overdue report edited");

    await shortcut();
    await prompt.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => stored("Overdue report edited")?.dueDate).toBe("2026-11-11");
    expect(store.calls.filter((call) => call === "EditItem")).toHaveLength(1);
    expect(pushBacks()).toBe(1);
    await expect
      .element(page.getByTestId("item-editor-title"))
      .toHaveValue("Overdue report edited");
  });
});

describe("baselines", () => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed row menu baseline", async () => {
      await openWorkspace();
      await settleTheme(theme);

      await openMenu("Overdue report");

      await expect.element(pushBackItem()).toBeVisible();
      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`push-back-menu-${theme}`);
    });

    it("Matches the reviewed disabled reason baseline", async () => {
      await openWorkspace();
      await settleTheme(theme);

      await openMenu("Someday");
      await userEvent.hover(pushBackItem(), { force: true });

      await expect.element(page.getByTestId("item-menu-push-back-reason")).toBeVisible();
      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`push-back-disabled-${theme}`);
    });
  });
});
