import type { Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  answerPrompt,
  chooseMenuCommand,
  createFolder,
  createProject,
  expectGone,
  goHome,
  itemRow,
  openAppSettingsFromMenu,
  openItemEditor,
  openProject,
  pickOption,
  saveItemEditor,
} from "../support/workflows.js";

const FOLDER = "Smoke Folder";

/** The Search page's text box. */
function searchText(page: Page) {
  return page.getByRole("searchbox", { name: "Search text" });
}

/** The titles of the shown search results, in order. */
async function resultTitles(page: Page) {
  const rows = page.getByTestId("search-result-row");
  const titles: string[] = [];
  for (const row of await rows.all()) {
    titles.push(await row.locator("span.truncate").first().innerText());
  }
  return titles;
}

async function addNumberField(page: Page, name: string) {
  await openAppSettingsFromMenu(page);
  await pickOption(page, page.getByTestId("field-new-type"), "Number");
  await page.getByTestId("field-new-name").fill(name);
  await page.getByTestId("field-add").click();
  await page.getByRole("listitem", { name, exact: true }).waitFor();
  await page.getByTestId("app-settings-back").click();
}

async function addItemWithPriorityAndEffort(
  page: Page,
  title: string,
  priority: string,
  effort: string,
) {
  await addItem(page, FOLDER, title);
  const editor = await openItemEditor(page, itemRow(page, FOLDER, title));
  await pickOption(page, editor.getByRole("combobox", { name: "Priority", exact: true }), priority);
  await editor.getByLabel("Effort", { exact: true }).fill(effort);
  await saveItemEditor(editor);
}

/** Adds a filter row and chooses its field and operator. */
async function addFilter(page: Page, field: string, operator: string) {
  await page.getByTestId("search-add-filter").click();
  const row = page.getByRole("group", { name: "Filter" }).last();
  await pickOption(page, row.getByRole("combobox", { name: "Filter field" }), field);
  await pickOption(page, row.getByRole("combobox", { name: "Filter operator" }), operator);
  return row;
}

/** Searches for Effort greater than 5 from a fresh Search page. */
async function searchEffortAboveFive(page: Page) {
  await chooseMenuCommand(page, "view", "menu-search");
  await addFilter(page, "Effort", "greater than");
  await page.getByRole("textbox", { name: "Effort value" }).fill("5");
  await page.getByTestId("search-submit").click();
  await expect.poll(() => resultTitles(page)).toEqual(["Effort match"]);
}

desktopTest(
  "Search matches a built-in priority and a custom number, opens the result in its folder, and finds it after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await addNumberField(page, "Effort");
      await openProject(page);
      await createFolder(page, FOLDER);
      await addItemWithPriorityAndEffort(page, "Priority match", "High", "2");
      await addItemWithPriorityAndEffort(page, "Effort match", "Low", "10");
      await goHome(page);

      await chooseMenuCommand(page, "view", "menu-search");
      const priority = await addFilter(page, "Priority", "is");
      await pickOption(page, priority.getByRole("combobox", { name: "Priority value" }), "High");
      await page.getByTestId("search-submit").click();
      await expect.poll(() => resultTitles(page)).toEqual(["Priority match"]);
      await priority.getByTestId("filter-remove").click();
      await addFilter(page, "Effort", "greater than");
      await page.getByRole("textbox", { name: "Effort value" }).fill("5");
      await page.getByTestId("search-submit").click();
      await expect.poll(() => resultTitles(page)).toEqual(["Effort match"]);
      await page.getByTestId("search-result-row").first().focus();
      await page.keyboard.press("Enter");

      await page.getByRole("heading", { level: 1, name: FOLDER }).waitFor();
      await expect
        .poll(() => itemRow(page, FOLDER, "Effort match").getAttribute("aria-selected"))
        .toBe("true");
    });

    await withDesktop(desktop, async (page) => {
      await searchEffortAboveFive(page);
    });
  },
);

desktopTest(
  "A query syntax search is saved, reopens from Home and is still there after relaunch",
  async ({ desktop }) => {
    const query = "title~invoice no:ticket";
    const expectOnlyInvoice = (page: Page) =>
      expect.poll(() => resultTitles(page)).toEqual(["Invoice review"]);
    const savedLink = (page: Page) =>
      page
        .getByRole("region", { name: "Saved searches" })
        .getByRole("button", { name: "Invoices", exact: true });
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Invoice review");
      await addItem(page, SMOKE_PROJECT, "Other task");
      await goHome(page);
      await chooseMenuCommand(page, "view", "menu-search");

      await searchText(page).fill(query);
      await searchText(page).press("Enter");
      await expectOnlyInvoice(page);
      await page.getByTestId("save-search").click();
      await answerPrompt(page, "Name", "Invoices");
      await page
        .getByRole("navigation", { name: "Saved searches" })
        .getByRole("button", { name: "Invoices" })
        .waitFor();
      await page.getByTestId("search-back").click();
      await expectGone(page.getByTestId("search-back"));
      await savedLink(page).click();

      await expectOnlyInvoice(page);
      expect(await searchText(page).inputValue()).toBe(query);
    });

    await withDesktop(desktop, async (page) => {
      await savedLink(page).click();

      await expectOnlyInvoice(page);
      expect(await searchText(page).inputValue()).toBe(query);
    });
  },
);
