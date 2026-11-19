import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { FAKE_LOOKUPS } from "../support/fake-area-items.js";
import type { SeedSavedSearch } from "../support/fake-saved-search-handlers.js";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { matchShellAtBothSizes, THEMES } from "../support/screenshots.js";

const typeId = (name: string) => FAKE_LOOKUPS.itemTypes.find((type) => type.name === name)!.id;
const priorityId = (name: string) =>
  FAKE_LOOKUPS.priorityLevels.find((level) => level.name === name)!.id;

const ctrlF = () => userEvent.keyboard("{Control>}f{/Control}");
const heading = () => page.getByRole("heading", { name: "Search", exact: true });
const searchInput = () => page.getByRole("searchbox", { name: "Search text" });
const scopeSelect = () => page.getByRole("combobox", { name: "Search scope" });
const includeCompleted = () => page.getByRole("checkbox", { name: "Include completed" });
const saveButton = () => page.getByRole("button", { name: "Save search", exact: true });
const renameButton = () => page.getByRole("button", { name: "Rename saved search" });
const deleteButton = () => page.getByRole("button", { name: "Delete saved search" });
const chips = () => page.getByRole("navigation", { name: "Saved searches" }).getByRole("button");
const chip = (name: string) =>
  page.getByRole("navigation", { name: "Saved searches" }).getByRole("button", { name });
const dialog = () => page.getByRole("dialog");
const alert = () => page.getByRole("alertdialog");
const dialogInput = () => dialog().getByRole("textbox");
const results = () => page.getByTestId("search-result-row");
const searchError = () => page.getByTestId("search-error");
const queryErrors = () => page.getByTestId("search-query-error");
const filterRows = () => page.getByRole("group", { name: "Filter" });

const PROJECTS: ReadonlyArray<SeedProject> = [
  {
    name: "Billing",
    items: [
      { title: "Fix deadlock", type: "Error", priority: "High" },
      { title: "Tidy logs", type: "Error", priority: "Low" },
      { title: "Talk deadlock", type: "Discussion", priority: "High" },
      {
        title: "Closed deadlock",
        type: "Error",
        priority: "High",
        completedAtUtc: "2026-11-12T09:00:00Z",
      },
    ],
  },
];

interface OpenOptions {
  readonly saved?: (store: FakeProjectStore) => ReadonlyArray<SeedSavedSearch>;
  readonly configure?: (store: FakeProjectStore) => void;
}

async function openApp({ saved = () => [], configure }: OpenOptions = {}) {
  const app = await renderApp({
    projects: PROJECTS,
    configure(store) {
      configure?.(store);
      saved(store).forEach((search) => store.savedSearches.add(search));
    },
  });
  await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  return app;
}

async function openSearch() {
  await ctrlF();
  await expect.element(heading()).toBeVisible();
}

/** Replaces the query box text by typing, as a user would. */
async function typeQuery(text: string) {
  await searchInput().click();
  await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
  await userEvent.keyboard(text.replaceAll("{", "{{").replaceAll("[", "[["));
}

/** Answers the open name prompt by replacing its text and pressing Enter. */
async function answerPrompt(title: string, name: string) {
  await expect.element(dialog()).toHaveAccessibleName(title);
  await dialogInput().fill(name);
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog()).not.toBeInTheDocument();
}

async function confirmDialog(title: string, button: string) {
  await expect.element(alert()).toHaveAccessibleName(title);
  await alert().getByRole("button", { name: button }).click();
  await expect.element(alert()).not.toBeInTheDocument();
}

function titlesShown() {
  return results()
    .elements()
    .map((element) => element.querySelector("span.truncate")?.textContent ?? "");
}

it("Saving asks for a name and stores the scope, completed switch and query with choice ids", async () => {
  const { store } = await openApp();
  await page.getByRole("article", { name: "Billing" }).click();
  await expect.element(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
  await openSearch();
  await includeCompleted().click();

  await typeQuery("deadlock priority:high");
  await saveButton().click();
  await answerPrompt("Save search", "Overdue");

  const projectId = store.summaries[0]!.project.id;
  await expect.element(chip("Overdue")).toHaveAttribute("aria-current", "true");
  expect(store.savedSearches.rows).toEqual([
    {
      id: expect.any(String),
      name: "Overdue",
      queryText: `deadlock priority:#${priorityId("High")}`,
      scope: { kind: "project", projectId },
      includeCompleted: true,
    },
  ]);
  await expect.element(renameButton()).toBeVisible();
  await expect.element(deleteButton()).toBeVisible();
  await expect.element(saveButton()).toHaveFocus();
});

it("Saving invalid text lists the errors and asks nothing", async () => {
  const { store } = await openApp();
  await openSearch();

  await typeQuery("zzz:1");
  await saveButton().click();

  await expect.element(queryErrors()).toMatchTextContent("Unknown field 'zzz'");
  expect(dialog().query()).toBeNull();
  expect(alert().query()).toBeNull();
  expect(store.savedSearches.rows).toEqual([]);
  expect(store.calls).not.toContain("SearchItems");
});

it("Cancelling the name prompt saves nothing", async () => {
  const { store } = await openApp();
  await openSearch();
  await typeQuery("type:error");

  await saveButton().click();
  await expect.element(dialog()).toHaveAccessibleName("Save search");
  await userEvent.keyboard("{Escape}");

  await expect.element(dialog()).not.toBeInTheDocument();
  await expect.element(heading()).toBeVisible();
  expect(store.calls).not.toContain("SaveSavedSearch");
});

it("Saving over an existing name asks before replacing it", async () => {
  const { store } = await openApp({
    saved: () => [{ name: "Mine", queryText: `type:#${typeId("Discussion")}` }],
  });
  await openSearch();
  await typeQuery("type:error");

  await saveButton().click();
  await answerPrompt("Save search", "mine");
  await expect
    .element(alert())
    .toMatchTextContent("A saved search named 'Mine' already exists. Replace it?");
  await userEvent.keyboard("{Escape}");
  await expect.element(alert()).not.toBeInTheDocument();
  expect(store.savedSearches.rows[0]?.queryText).toBe(`type:#${typeId("Discussion")}`);
  await saveButton().click();
  await answerPrompt("Save search", "MINE");
  await confirmDialog("Replace saved search", "Replace");

  await expect.element(chip("Mine")).toHaveAttribute("aria-current", "true");
  expect(store.savedSearches.rows).toEqual([
    expect.objectContaining({ name: "Mine", queryText: `type:#${typeId("Error")}` }),
  ]);
  expect(store.calls.filter((call) => call === "SaveSavedSearch")).toHaveLength(1);
});

it("Opening a chip restores scope, text, rows and completed switch and runs it once", async () => {
  const { store } = await openApp({
    saved: (seeded) => [
      { name: "Other", queryText: "tidy" },
      {
        name: "Errors",
        queryText: `deadlock type:#${typeId("Error")}`,
        scope: { kind: "project", projectId: seeded.summaries[0]!.project.id },
        includeCompleted: true,
      },
    ],
  });
  await openSearch();
  await expect.element(chips().first()).toMatchTextContent("Other");
  store.calls.length = 0;

  await chip("Errors").click();

  await expect.element(results().first()).toBeVisible();
  expect(titlesShown().toSorted()).toEqual(["Closed deadlock", "Fix deadlock"]);
  await expect.element(searchInput()).toHaveValue("deadlock type:Error");
  await expect.element(searchInput()).toHaveFocus();
  await expect.element(scopeSelect()).toMatchTextContent("This project");
  await expect.element(includeCompleted()).toBeChecked();
  await expect.element(filterRows()).toHaveLength(1);
  await expect
    .element(filterRows().getByRole("combobox", { name: "Filter field" }))
    .toMatchTextContent("Type");
  await expect.element(chip("Errors")).toHaveAttribute("aria-current", "true");
  expect(chip("Other").element()).not.toHaveAttribute("aria-current");
  expect(store.calls.filter((call) => call === "SearchItems")).toHaveLength(1);
});

it("Opening from Search replaces it, keeps the return page and reaches chips by keyboard", async () => {
  const { history } = await openApp({
    saved: () => [{ name: "Errors", queryText: `type:#${typeId("Error")}` }],
  });
  await page.getByRole("article", { name: "Billing" }).click();
  const returnPath = history.location.pathname;
  await openSearch();
  await typeQuery("draft words");

  await expect.element(chip("Errors")).toBeVisible();
  chip("Errors").element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(searchInput()).toHaveValue("type:Error");
  await expect.element(scopeSelect()).toMatchTextContent("All projects");
  await expect.element(searchInput()).toHaveFocus();
  await userEvent.keyboard("{Escape}");

  await expect.element(heading()).not.toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
  expect(history.location.pathname).toBe(returnPath);
});

it("Rename and Delete act on the open saved search", async () => {
  const { store } = await openApp({
    saved: () => [
      { name: "First", queryText: "a" },
      { name: "Second", queryText: "b" },
    ],
  });
  await openSearch();
  await expect.element(renameButton()).not.toBeInTheDocument();
  await chip("Second").click();
  await expect.element(searchInput()).toHaveValue("b");

  await renameButton().click();
  await answerPrompt("Rename saved search", "FIRST");
  await expect.element(alert()).toMatchTextContent("A saved search named 'First' already exists.");
  await alert().getByRole("button", { name: "OK" }).click();
  await expect.element(alert()).not.toBeInTheDocument();
  await renameButton().click();
  await answerPrompt("Rename saved search", "Renamed");
  await expect.element(chip("Renamed")).toHaveAttribute("aria-current", "true");
  await deleteButton().click();
  await expect.element(alert()).toMatchTextContent("Delete the saved search 'Renamed'?");
  await userEvent.keyboard("{Escape}");
  await expect.element(alert()).not.toBeInTheDocument();
  await deleteButton().click();
  await confirmDialog("Delete saved search", "Delete");

  await expect.element(chip("Renamed")).not.toBeInTheDocument();
  await expect.element(deleteButton()).not.toBeInTheDocument();
  await expect.element(saveButton()).toHaveFocus();
  expect(store.savedSearches.rows.map((row) => row.name)).toEqual(["First"]);
});

it("A saved search survives renaming a choice label", async () => {
  let readyId = "";
  await openApp({
    configure(store) {
      const stage = store.customFields.addFieldSeed("Stage", "Choice");
      readyId = store.customFields.addChoiceSeed(stage.id, "Ready").id;
      store.customFields.saveChoice({ ...store.customFields.choicesOf(stage.id)[0]!, label: "Go" });
    },
    saved: () => [{ name: "Ready", queryText: `stage:#${readyId}` }],
  });
  await openSearch();

  await chip("Ready").click();

  await expect.element(searchInput()).toHaveValue("stage:Go");
  await expect.element(searchError()).not.toBeInTheDocument();
});

it.each([
  {
    stale: "an archived field",
    queryText: "effort>3",
    reason: "Unknown field 'effort'",
    configure: (store: FakeProjectStore) => {
      const effort = store.customFields.addFieldSeed("Effort", "Number");
      store.customFields.archiveField(effort.id);
    },
  },
  {
    stale: "a deleted choice",
    queryText: "type:#0190A1B2-0000-7000-8000-00000000DEAD",
    reason: "That Type choice no longer exists.",
    configure: () => {},
  },
])("A saved search with $stale reports it inline and runs nothing", async (example) => {
  const { store } = await openApp({
    configure: example.configure,
    saved: () => [{ name: "Stale", queryText: example.queryText }],
  });
  await openSearch();

  await chip("Stale").click();

  await expect.element(searchError()).toMatchTextContent("The saved search 'Stale' can't be run.");
  await expect.element(searchError()).toMatchTextContent(example.reason);
  await expect.element(searchInput()).toHaveValue(example.queryText);
  expect(store.calls).not.toContain("SearchItems");
});

it("Undo removes a saved search from the chips", async () => {
  const { store } = await openApp();
  await openSearch();
  await typeQuery("type:error");
  await saveButton().click();
  await answerPrompt("Save search", "Errors");
  await expect.element(chip("Errors")).toBeVisible();

  await userEvent.keyboard("{Control>}z{/Control}");

  await expect.element(chip("Errors")).not.toBeInTheDocument();
  await expect.element(renameButton()).not.toBeInTheDocument();
  expect(store.savedSearches.rows).toEqual([]);
});

it.each(THEMES)("Renders Search opened from a saved search in %s mode", async (theme) => {
  await openApp({
    saved: (store) => [
      { name: "Overdue changes", queryText: `type:#${typeId("Change")} due<2026-11-13` },
      {
        name: "Urgent deadlocks",
        queryText: `deadlock priority:#${priorityId("High")}`,
        scope: { kind: "project", projectId: store.summaries[0]!.project.id },
        includeCompleted: true,
      },
      { name: "No ticket", queryText: "no:ticket" },
    ],
  });
  await openSearch();
  await chip("Urgent deadlocks").click();
  await expect.element(results().first()).toBeVisible();

  await matchShellAtBothSizes("search-saved", theme);
});
