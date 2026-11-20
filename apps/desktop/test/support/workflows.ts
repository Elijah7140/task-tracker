import type { Locator, Page } from "playwright";
import { expect } from "vitest";

/** The project name the legacy smoke tests used. */
export const SMOKE_PROJECT = "Smoke Project";

/** A project's card on the home screen. */
export function projectCard(page: Page, name: string) {
  return page.getByRole("article", { name, exact: true });
}

/** The open item tree of an area, named after the project or folder. */
export function itemTree(page: Page, area: string) {
  return page.getByRole("tree", { name: `Items in ${area}`, exact: true });
}

/** An item row in the area's tree. */
export function itemRow(page: Page, area: string, title: string) {
  return itemTree(page, area).getByRole("treeitem", { name: title, exact: true });
}

/** A folder row in the open project's sidebar tree. */
export function folderRow(page: Page, project: string, name: string) {
  return page
    .getByRole("tree", { name: `Folders in ${project}`, exact: true })
    .getByRole("treeitem", { name, exact: true });
}

/** The quick-add line at the end of the open list. */
export function quickAdd(page: Page) {
  return page.getByTestId("quick-add-input");
}

/** Resolves once the locator's element has keyboard focus. */
export async function expectFocused(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => element === document.activeElement))
    .toBe(true);
}

/** Resolves once the element is no longer in the page. */
export function expectGone(locator: Locator) {
  return locator.waitFor({ state: "detached" });
}

/**
 * Types into the open dialog's text box once it has focus and presses Enter.
 * Keys sent before the dialog moves focus would reach the page behind it.
 */
export async function answerPrompt(page: Page, label: string, text: string) {
  const input = page.getByRole("textbox", { name: label, exact: true });
  await expectFocused(input);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

/** Confirms the open confirmation with Enter once its confirm button has focus. */
export async function confirmWithEnter(page: Page) {
  await expectFocused(page.getByTestId("confirm-dialog-confirm"));
  await page.keyboard.press("Enter");
  await expectGone(page.getByTestId("confirm-dialog"));
}

/** Creates a project from the home screen's New project button and waits for its card. */
export async function createProject(page: Page, name = SMOKE_PROJECT) {
  await page.getByTestId("new-project-button").click();
  await answerPrompt(page, "Project name", name);
  await projectCard(page, name).waitFor();
}

/**
 * Expands the navigation sidebar, which starts as an icon rail (§7.19), so the open
 * project's folder tree shows. The choice persists across relaunches of the same profile.
 */
export async function expandSidebar(page: Page) {
  const sidebar = page.getByTestId("sidebar");
  if ((await sidebar.getAttribute("data-collapsed")) === "true") {
    await page.getByTestId("sidebar-toggle").click();
  }
  await page.locator('[data-testid="sidebar"][data-collapsed="false"]').waitFor();
}

/** Opens a project from its home card, waits for quick-add and shows its folder tree. */
export async function openProject(page: Page, name = SMOKE_PROJECT) {
  await projectCard(page, name).click();
  await quickAdd(page).waitFor();
  await expandSidebar(page);
}

/** Types a title into quick-add, presses Enter and waits for the new row. */
export async function addItem(page: Page, area: string, title: string) {
  await quickAdd(page).fill(title);
  await quickAdd(page).press("Enter");
  await itemRow(page, area, title).waitFor();
}

/** Expands an area's or item's collapsed Completed section. */
export async function expandCompleted(scope: Locator, label: string) {
  await scope
    .getByRole("treeitem", { name: label, exact: true })
    .getByTestId("completed-section-toggle")
    .first()
    .click();
}

/** Whether an item row's completion control shows it as finished. */
export function isCompleted(row: Locator) {
  return row.getByTestId("item-completion").first().getAttribute("data-completed");
}

/** Opens the item editor through the card's or row's context menu, opened on its title. */
export async function openItemEditor(page: Page, row: Locator) {
  await row.getByTestId("item-title").first().click({ button: "right" });
  await page.getByTestId("item-menu-edit").click();
  const editor = page.getByTestId("item-editor");
  await editor.waitFor();
  return editor;
}

/** Saves an editor draft and waits for a successful save to close the editor. */
export async function saveItemEditor(editor: Locator) {
  await editor.getByTestId("item-editor-save").click();
  await expectGone(editor);
}

/** A top-level menu of the window's menu bar. */
export type MenuName = "file" | "edit" | "project" | "view";

/** Opens a menu of the menu bar and clicks one of its commands by test ID. */
export async function chooseMenuCommand(page: Page, menu: MenuName, command: string) {
  await page.getByTestId(`menu-${menu}`).click();
  await page.getByTestId(`${menu}-menu`).getByTestId(command).click();
}

/** Opens App Settings from File → Settings. */
export function openAppSettingsFromMenu(page: Page) {
  return chooseMenuCommand(page, "file", "menu-app-settings");
}

/** Reads View → Reminders, whose label carries the pending count, and closes the menu. */
export async function remindersMenuLabel(page: Page) {
  await page.getByTestId("menu-view").click();
  const label = await page.getByTestId("menu-reminders").innerText();
  await page.keyboard.press("Escape");
  await expectGone(page.getByTestId("view-menu"));
  return label.split("\n")[0]?.trim();
}

/** Focuses and selects an item row or card by clicking its title. */
export function selectItem(page: Page, area: string, title: string) {
  return itemRow(page, area, title).getByTestId("item-title").first().click();
}

/** Returns to the home screen from the sidebar. */
export async function goHome(page: Page) {
  await page.getByTestId("sidebar-home").click();
  await page.getByRole("heading", { level: 1, name: "Projects" }).waitFor();
}

/** Picks an option from a dropdown and waits for its list to close. */
export async function pickOption(page: Page, control: Locator, option: string) {
  await control.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expectGone(page.getByRole("listbox"));
}

/** Creates a folder at the top of the open project from the sidebar and opens it. */
export async function createFolder(page: Page, name: string, project = SMOKE_PROJECT) {
  await page.getByRole("button", { name: `New folder in ${project}` }).click();
  await answerPrompt(page, "Folder name", name);
  await openFolder(page, name, project);
}

/** Opens a folder of the open project from the sidebar and waits for its heading. */
export async function openFolder(page: Page, name: string, project = SMOKE_PROJECT) {
  await folderRow(page, project, name).getByTestId("folder-row").first().click();
  await page.getByRole("heading", { level: 1, name }).waitFor();
}

/**
 * The local calendar date `days` from now on the real clock in the OS zone,
 * which the packaged app also reads, as `YYYY-MM-DD`.
 */
export function localDate(days = 0) {
  const date = new Date(Date.now());
  date.setDate(date.getDate() + days);
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}
