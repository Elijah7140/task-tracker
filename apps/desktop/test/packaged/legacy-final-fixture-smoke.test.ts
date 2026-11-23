import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Page } from "playwright";
import { expect } from "vitest";
import {
  desktopTest,
  legacyFinalFixture,
  useLegacyFinalFixture,
  withDesktop,
} from "../support/desktop-app.js";
import {
  answerPrompt,
  chooseMenuCommand,
  confirmWithEnter,
  expandCompleted,
  expectGone,
  goHome,
  isCompleted,
  itemRow,
  openFolder,
  openItemEditor,
  openProject,
  projectCard,
  selectItem,
} from "../support/workflows.js";

const PROJECT = "Sample project";
const AREA = "Nested folder";
const TICKET = "Recurring sample ticket";
const SAVED_SEARCH = "Completed in sample";

async function fixtureHash() {
  return createHash("sha256")
    .update(await readFile(legacyFinalFixture))
    .digest("hex");
}

/** The titles of the shown search results, sorted. */
async function sortedResultTitles(page: Page) {
  const titles: string[] = [];
  for (const row of await page.getByTestId("search-result-row").all()) {
    titles.push(await row.locator("span.truncate").first().innerText());
  }
  return titles.sort();
}

/** The fixture's saved search on Home. */
function savedSearchLink(page: Page) {
  return page
    .getByRole("region", { name: "Saved searches" })
    .getByRole("button", { name: SAVED_SEARCH, exact: true });
}

/** The Search page's text box. */
function searchText(page: Page) {
  return page.getByRole("searchbox", { name: "Search text" });
}

/**
 * The legacy generator stored `status:completed`, which the EF migration renamed to
 * `completed:completed`. Legacy Boolean values were only yes/no/true/false, so the
 * final .NET release refused to run it with this same message. Fix and replace it.
 */
async function repairSavedSearch(page: Page) {
  await savedSearchLink(page).click();
  await page
    .getByTestId("search-error")
    .getByText(`The saved search '${SAVED_SEARCH}' can't be run. 'completed' is not yes or no.`)
    .waitFor();
  expect(await searchText(page).inputValue()).toBe("completed:completed");
  await searchText(page).fill("is:done");
  await searchText(page).press("Enter");
  await expect.poll(() => sortedResultTitles(page)).toEqual(["Sample child", "Sample parent"]);
  await page.getByTestId("save-search").click();
  await answerPrompt(page, "Name", SAVED_SEARCH);
  await page.getByRole("alertdialog", { name: "Replace saved search" }).waitFor();
  await confirmWithEnter(page);
  await page.getByTestId("search-back").click();
  await expectGone(page.getByTestId("search-back"));
}

/**
 * Reopens the repaired saved search from Home and checks its query and results.
 * Restoring the open "Deleted child" reopened its completed parent (§6.1), so only
 * the completed child still matches.
 */
async function expectRepairedSavedSearch(page: Page) {
  await savedSearchLink(page).click();
  await expect.poll(() => sortedResultTitles(page)).toEqual(["Sample child"]);
  expect(await searchText(page).inputValue()).toBe("is:done");
  await page.getByTestId("search-back").click();
  await expectGone(page.getByTestId("search-back"));
}

/** Opens the fixture's nested folder. */
async function openNestedFolder(page: Page) {
  await openProject(page, PROJECT);
  await openFolder(page, "Sample folder", PROJECT);
  await openFolder(page, AREA, PROJECT);
}

/** The ticket's status chip text and its due date from the editor. */
async function ticketState(page: Page) {
  const card = itemRow(page, AREA, TICKET);
  const status = await card.getByTestId("item-status-chip").innerText();
  const editor = await openItemEditor(page, card);
  const due = await editor.getByLabel("Due date", { exact: true }).inputValue();
  await page.keyboard.press("Escape");
  await expectGone(editor);
  return { status, due };
}

/** Checks the legacy item values the later work packages read: link, Markdown, ticket and repeat. */
async function expectLegacyItemValues(page: Page) {
  const card = itemRow(page, AREA, TICKET);
  expect(await card.getByTestId("item-ticket").first().innerText()).toBe("SAMPLE-7");
  const group = card.locator("xpath=ancestor::li[@data-testid='priority-section']");
  expect(await group.getByTestId("priority-group-header").innerText()).toContain("7 · High");
  expect(await card.getByTestId("repeat-marker").first().getAttribute("aria-label")).toBe(
    "Repeats: Every 2 days",
  );
  const editor = await openItemEditor(page, card);
  await editor.getByTestId("item-editor-description-preview-tab").click();
  expect(
    await editor.getByTestId("item-editor-description-preview").locator("strong").innerText(),
  ).toBe("Sample notes");
  await page.keyboard.press("Escape");
  await expectGone(editor);
}

/** The Tickets page lists the fixture ticket under its numbered priority. */
async function expectTicketUnderNumberedPriority(page: Page) {
  await chooseMenuCommand(page, "view", "menu-tickets");
  await page
    .getByTestId("tickets-page")
    .getByRole("region", { name: "7 · High", exact: true })
    .getByRole("listitem", { name: TICKET, exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await expectGone(page.getByTestId("tickets-page"));
}

/** The pre-adoption backup holds the EF rows and no Effect migration ledger. */
async function expectPreAdoptionBackup(database: string) {
  const folder = dirname(database);
  const backups = (await readdir(folder)).filter((name) => /^tasktracker-\d+\.db\.bak$/.test(name));
  expect(backups).toHaveLength(1);
  using backup = new DatabaseSync(join(folder, backups[0]!), { readOnly: true });
  const ledger = backup
    .prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'effect_sql_migrations'")
    .get();
  const items = backup.prepare("SELECT Title FROM TodoItem ORDER BY Title").all();
  expect(ledger).toEqual({ count: 0 });
  expect(items.map((row) => row["Title"])).toEqual([
    "Deleted child",
    TICKET,
    "Sample child",
    "Sample parent",
  ]);
}

desktopTest(
  "Adopts a disposable copy of the legacy-final EF fixture and uses its saved search, statuses, priorities, repeats, links, Trash and undo across relaunch",
  { timeout: 60_000 },
  async ({ desktop }) => {
    const originalHash = await fixtureHash();
    await useLegacyFinalFixture(desktop);

    await withDesktop(desktop, async (page) => {
      await projectCard(page, PROJECT).waitFor();
      await repairSavedSearch(page);
      await openNestedFolder(page);
      await expectLegacyItemValues(page);
      expect(await ticketState(page)).toEqual({ status: "In progress", due: "12/11/2026" });

      await itemRow(page, AREA, TICKET)
        .getByTestId("item-title")
        .first()
        .click({ button: "right" });
      await page.getByTestId("item-menu-set-status").click();
      await page.getByRole("menuitemradio", { name: "Testing", exact: true }).click();
      await expect
        .poll(() => itemRow(page, AREA, TICKET).getByTestId("item-status-chip").innerText())
        .toBe("Testing");
      await selectItem(page, AREA, TICKET);
      await page.keyboard.press("Control+Shift+P");
      await expect.poll(() => ticketState(page)).toEqual({ status: "Testing", due: "12/12/2026" });

      await goHome(page);
      await chooseMenuCommand(page, "view", "menu-trash");
      const deleted = page
        .getByTestId("trash-list")
        .getByRole("article", { name: "Deleted child" });
      await deleted.getByRole("button", { name: "Restore" }).click();
      await page.getByText("The trash is empty.").waitFor();
      await page.getByTestId("menu-edit").focus();
      await page.keyboard.press("Control+Z");
      await deleted.waitFor();
      await page.getByTestId("menu-edit").focus();
      await page.keyboard.press("Control+Y");
      await page.getByText("The trash is empty.").waitFor();
    });

    await withDesktop(desktop, async (page) => {
      await expectRepairedSavedSearch(page);
      await chooseMenuCommand(page, "view", "menu-trash");
      await page.getByText("The trash is empty.").waitFor();
      await page.keyboard.press("Escape");
      await expectTicketUnderNumberedPriority(page);
      await openNestedFolder(page);
      await expectLegacyItemValues(page);

      expect(await ticketState(page)).toEqual({ status: "Testing", due: "12/12/2026" });
      const parent = itemRow(page, AREA, "Sample parent");
      expect(await isCompleted(parent)).toBe("false");
      expect(await isCompleted(itemRow(page, AREA, "Deleted child"))).toBe("false");
      await expandCompleted(parent, "1 completed");
      const child = await openItemEditor(page, itemRow(page, AREA, "Sample child"));
      const link = child.getByTestId("item-editor-link-open");
      expect(await link.getAttribute("aria-label")).toBe("Sample link");
      expect(await link.getAttribute("title")).toBe("https://example.test/guide");
      await page.keyboard.press("Escape");
      await expectGone(child);
    });

    await expectPreAdoptionBackup(desktop.database);
    expect(await fixtureHash()).toBe(originalHash);
    expect(existsSync(`${legacyFinalFixture}-wal`)).toBe(false);
    expect(existsSync(`${legacyFinalFixture}-shm`)).toBe(false);
  },
);
