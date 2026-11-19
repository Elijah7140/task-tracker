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

/** Opens a project from its home card and waits for quick-add. */
export async function openProject(page: Page, name = SMOKE_PROJECT) {
  await projectCard(page, name).click();
  await quickAdd(page).waitFor();
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
