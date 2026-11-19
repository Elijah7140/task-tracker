import { Effect } from "effect";
import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const ctrlF = () => userEvent.keyboard("{Control>}f{/Control}");
const heading = () => page.getByRole("heading", { name: "Search", exact: true });
const searchInput = () => page.getByRole("searchbox", { name: "Search text" });
const searchButton = () =>
  page.getByRole("search").getByRole("button", { name: "Search", exact: true });
const scopeSelect = () => page.getByRole("combobox", { name: "Search scope" });
const back = () => page.getByRole("button", { name: "Back" });
const addFilter = () => page.getByRole("button", { name: "Add filter" });
const filterRow = (index = 0) => page.getByRole("group", { name: "Filter" }).nth(index);
const results = () => page.getByTestId("search-result-row");
const result = (title: string) => results().filter({ hasText: title });
const item = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const searchError = () => page.getByTestId("search-error");

const PROJECTS: ReadonlyArray<SeedProject> = [
  {
    name: "Billing",
    items: [
      { title: "Root invoice", ticketNumber: "BILL-1", priority: "Critical" },
      { title: "Paid invoice", ticketNumber: "BILL-4", completedAtUtc: "2026-11-12T09:00:00Z" },
    ],
    folders: [
      {
        name: "Invoices",
        items: [
          {
            title: "Audit Q4",
            ticketNumber: "BILL-2",
            priority: "Medium",
            dueDate: "2026-11-20",
            children: [{ title: "Audit receipts", priority: "Low" }],
          },
        ],
      },
      { name: "Nested", parent: "Invoices", items: [{ title: "Nested check", priority: "High" }] },
    ],
  },
  { name: "Platform", items: [{ title: "Platform migration", ticketNumber: "PLAT-9" }] },
];

async function openApp() {
  const app = await renderApp({
    projects: PROJECTS,
    configure(store) {
      const platform = store.summaries[1]!.project.id;
      Effect.runSync(store.customFields.create("Cost Center", "Text", platform));
      Effect.runSync(store.customFields.create("Estimate", "Number", null));
    },
  });
  await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  return app;
}

async function openProject(name: string) {
  await page.getByRole("article", { name }).click();
  await expect.element(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

async function openFolder(name: string) {
  await item(name).getByTestId("folder-row").first().click();
  await expect.element(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

async function choose(control: ReturnType<typeof page.getByRole>, option: string) {
  await control.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
}

async function addRow(field: string, operator?: string) {
  await addFilter().click();
  const added = page.getByRole("group", { name: "Filter" }).last();
  await choose(added.getByRole("combobox", { name: "Filter field" }), field);
  if (operator !== undefined) {
    await choose(added.getByRole("combobox", { name: "Filter operator" }), operator);
  }
  return added;
}

async function titlesShown() {
  await expect.element(results().first()).toBeVisible();
  return results()
    .elements()
    .map((element) => element.querySelector("span.truncate")?.textContent ?? "");
}

it("Opens with Ctrl+F or the sidebar, focuses the text box and returns with Back or Escape", async () => {
  await openApp();

  await userEvent.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");
  await expect.element(heading()).not.toBeInTheDocument();
  await ctrlF();

  await expect.element(heading()).toBeVisible();
  await expect.element(searchInput()).toHaveFocus();
  await expect.element(page.getByTestId("sidebar-search")).toHaveAttribute("aria-current", "page");
  await expect.element(scopeSelect()).toHaveTextContent("All projects");
  await searchInput().fill("audit");
  await addFilter().click();
  await ctrlF();
  await expect.element(searchInput()).toHaveFocus();
  await expect.element(searchInput()).toHaveValue("audit");
  await userEvent.keyboard("{Escape}");
  await expect.element(heading()).not.toBeInTheDocument();
  await page.getByTestId("sidebar-search").click();
  await expect.element(heading()).toBeVisible();
  await expect.element(searchInput()).toHaveValue("");
  await back().click();
  await expect.element(heading()).not.toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
});

it("Starts in the originating folder and searches sub-items with or without subfolders", async () => {
  await openApp();
  await openProject("Billing");
  await openFolder("Invoices");

  await ctrlF();
  await expect.element(scopeSelect()).toHaveTextContent("This folder");
  await userEvent.keyboard("{Enter}");

  expect(await titlesShown()).toEqual(["Audit Q4", "Audit receipts", "Nested check"]);
  await page.getByRole("checkbox", { name: "Include subfolders" }).click();
  await searchButton().click();
  await expect.element(result("Nested check")).not.toBeInTheDocument();
  expect(await titlesShown()).toEqual(["Audit Q4", "Audit receipts"]);
  await choose(scopeSelect(), "Project root only");
  await expect
    .element(page.getByRole("checkbox", { name: "Include subfolders" }))
    .not.toBeInTheDocument();
  await searchButton().click();
  await expect.element(result("Audit Q4")).not.toBeInTheDocument();
  expect(await titlesShown()).toEqual(["Root invoice"]);
  await page.getByRole("checkbox", { name: "Include completed" }).click();
  await searchButton().click();
  await expect.element(result("Paid invoice")).toBeVisible();
});

it("Keeps blank rows and offered fields and drops another project's field when the scope narrows", async () => {
  const { store } = await openApp();
  await openProject("Billing");
  await ctrlF();
  await expect.element(scopeSelect()).toHaveTextContent("This project");
  await choose(scopeSelect(), "All projects");

  await addRow("Cost Center", "is empty");
  await addRow("Estimate", "is empty");
  await addFilter().click();
  await expect.element(searchButton()).toBeDisabled();
  await filterRow(2).getByRole("button", { name: "Remove filter" }).click();
  await choose(scopeSelect(), "This project");

  await expect.element(page.getByRole("group", { name: "Filter" })).toHaveLength(1);
  await expect
    .element(filterRow(0).getByRole("combobox", { name: "Filter field" }))
    .toHaveTextContent("Estimate");
  await searchButton().click();
  await expect.element(result("Root invoice")).toBeVisible();
  expect(store.search.queries.at(-1)?.filters).toEqual([
    { fieldKey: "estimate", operator: "isEmpty", value: null },
  ]);
});

it("Blocks invalid rows inline, keeps the shown results and searches priority ranges in rank order", async () => {
  const { store } = await openApp();
  await openProject("Billing");
  await ctrlF();
  await searchButton().click();
  await expect.element(result("Root invoice")).toBeVisible();

  const estimate = await addRow("Estimate", "between");
  await estimate.getByRole("textbox", { name: "Estimate from" }).fill("8");
  await estimate.getByRole("textbox", { name: "Estimate to" }).fill("3");
  await expect
    .element(estimate.getByTestId("filter-error"))
    .toHaveTextContent("The first value must not be after the second.");
  await expect.element(searchButton()).toBeDisabled();
  await userEvent.keyboard("{Enter}");
  await estimate.getByRole("textbox", { name: "Estimate from" }).fill("x");
  await expect
    .element(estimate.getByTestId("filter-error"))
    .toHaveTextContent("Enter a valid number.");
  await expect.element(result("Root invoice")).toBeVisible();
  expect(store.calls.filter((call) => call === "SearchItems")).toHaveLength(1);
  await estimate.getByRole("button", { name: "Remove filter" }).click();

  const priority = await addRow("Priority", "between");
  await choose(priority.getByRole("combobox", { name: "Priority from" }), "Low");
  await choose(priority.getByRole("combobox", { name: "Priority to" }), "High");
  await expect
    .element(priority.getByTestId("filter-error"))
    .toHaveTextContent("Put the more important priority first.");
  await choose(priority.getByRole("combobox", { name: "Priority from" }), "High");
  await choose(priority.getByRole("combobox", { name: "Priority to" }), "Low");
  await searchButton().click();

  await expect.element(result("Root invoice")).not.toBeInTheDocument();
  expect(await titlesShown()).toEqual(["Audit Q4", "Audit receipts", "Nested check"]);
  await choose(priority.getByRole("combobox", { name: "Filter operator" }), "more important than");
  await choose(priority.getByRole("combobox", { name: "Priority value" }), "Medium");
  await searchButton().click();
  await expect.element(result("Audit Q4")).not.toBeInTheDocument();
  expect(await titlesShown()).toEqual(["Nested check", "Root invoice"]);
});

it("Searches text with Enter and shows each result's ticket, location, priority and due date", async () => {
  await openApp();
  await ctrlF();

  await searchInput().fill("aud");
  await userEvent.keyboard("{Enter}");

  const audit = result("Audit Q4");
  await expect.element(audit).toMatchTextContent("BILL-2");
  await expect.element(audit).toMatchTextContent("Billing › Invoices");
  await expect.element(audit).toMatchTextContent("Medium");
  await expect.element(audit).toMatchTextContent("Nov 20, 2026");
  await expect.element(result("Audit receipts")).toBeVisible();
  await searchInput().fill("nothing-matches");
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByText("No items match")).toBeVisible();
});

it("Opens a result in its current folder with its parent expanded, after asking about a draft", async () => {
  const { store } = await openApp();
  await openProject("Billing");
  await item("Root invoice").getByTestId("item-row").click();
  await userEvent.keyboard("{Enter}");
  await page.getByTestId("item-editor-title").fill("Unsaved title");
  await ctrlF();
  await searchInput().fill("receipts");
  await userEvent.keyboard("{Enter}");
  const dialog = page.getByRole("alertdialog", { name: "Unsaved changes" });

  await result("Audit receipts").click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.element(heading()).toBeVisible();
  expect(store.calls).not.toContain("LocateSearchItem");
  await result("Audit receipts").click();
  await dialog.getByRole("button", { name: "Discard" }).click();

  await expect.element(page.getByRole("heading", { name: "Invoices", level: 1 })).toBeVisible();
  await expect.element(item("Audit receipts")).toHaveAttribute("aria-selected", "true");
  await expect.element(item("Audit receipts")).toHaveFocus();
});

it("Runs one activation at a time and drops a pending one when Search closes", async () => {
  const { store } = await openApp();
  await openProject("Platform");
  await ctrlF();
  await choose(scopeSelect(), "All projects");
  await searchInput().fill("audit");
  await userEvent.keyboard("{Enter}");
  const release = store.hold("LocateSearchItem");

  await result("Audit Q4").click();
  await result("Audit receipts").click();
  await back().click();
  release();

  await expect.element(heading()).not.toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Platform", level: 1 })).toBeVisible();
  await expect
    .poll(() => store.calls.filter((call) => call === "LocateSearchItem"))
    .toHaveLength(1);
  await expect.element(item("Platform migration")).toBeVisible();
});

it("Reports a deleted result, a refused search and the more-results note inline", async () => {
  const { store } = await openApp();
  await ctrlF();
  await searchInput().fill("root");
  await userEvent.keyboard("{Enter}");
  await expect.element(result("Root invoice")).toBeVisible();
  const billing = store.summaries[0]!.project.id;
  const root = store.findItemByTitle(billing, null, "Root invoice")!;
  store.deleteItem(billing, null, root.item.id);

  await result("Root invoice").click();
  await expect.element(searchError()).toHaveTextContent("This item no longer exists");
  await expect.element(heading()).toBeVisible();
  store.search.searchFailure = "Search project does not exist.";
  await searchButton().click();
  await expect.element(searchError()).toHaveTextContent("Search project does not exist.");
  store.search.searchFailure = null;
  store.search.pageSize = 1;
  await searchInput().fill("");
  await searchButton().click();

  await expect
    .element(page.getByTestId("search-has-more"))
    .toHaveTextContent("Showing the first 200 matches — narrow your search");
  await expect.element(results()).toHaveLength(1);
});

it("Shows a field list failure and never searches while fields are unavailable", async () => {
  await renderApp({
    projects: PROJECTS,
    configure(store) {
      store.search.fieldsFailure = "The operation could not be completed.";
    },
  });

  await ctrlF();

  await expect.element(searchError()).toHaveTextContent("The operation could not be completed.");
  await expect.element(searchButton()).toBeDisabled();
});

it("Refreshes shown results when undo changes an item behind Search", async () => {
  await openApp();
  await openProject("Billing");
  await item("Root invoice").getByTestId("item-row").click();
  await userEvent.keyboard("{F2}");
  await userEvent.keyboard("Renamed invoice{Enter}");
  await expect.element(item("Renamed invoice")).toBeVisible();
  await ctrlF();
  await searchInput().fill("renamed");
  await userEvent.keyboard("{Enter}");
  await expect.element(result("Renamed invoice")).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Undo/ }).click();

  await expect.element(page.getByText("No items match")).toBeVisible();
  await searchInput().fill("root");
  await userEvent.keyboard("{Enter}");
  await expect.element(result("Root invoice")).toBeVisible();
});

it.each(THEMES)("Renders the Search results and filters in %s mode", async (theme) => {
  await openApp();
  await openProject("Billing");
  await ctrlF();
  await addRow("Priority", "between");
  await choose(filterRow().getByRole("combobox", { name: "Priority from" }), "Critical");
  await choose(filterRow().getByRole("combobox", { name: "Priority to" }), "Medium");
  const estimate = await addRow("Estimate", "between");
  await estimate.getByRole("textbox", { name: "Estimate from" }).fill("8");
  await estimate.getByRole("textbox", { name: "Estimate to" }).fill("3");
  await estimate.getByRole("button", { name: "Remove filter" }).click();
  await searchButton().click();
  await expect.element(result("Audit Q4")).toBeVisible();
  await addRow("Estimate", "between");
  await page.getByRole("textbox", { name: "Estimate from" }).fill("8");
  await page.getByRole("textbox", { name: "Estimate to" }).fill("3");
  await settleTheme(theme);

  await expect(page.getByTestId("app-shell")).toMatchScreenshot(`search-results-${theme}`);
});

it.each(THEMES)("Renders the empty and refused Search states in %s mode", async (theme) => {
  const { store } = await openApp();
  await ctrlF();
  await searchInput().fill("nothing-matches");
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByText("No items match")).toBeVisible();
  await settleTheme(theme);
  await expect(page.getByTestId("app-shell")).toMatchScreenshot(`search-empty-${theme}`);
  store.search.searchFailure = "Search project does not exist.";

  await searchButton().click();
  await expect.element(searchError()).toBeVisible();
  await settleTheme(theme);

  await expect(page.getByTestId("app-shell")).toMatchScreenshot(`search-error-${theme}`);
});
