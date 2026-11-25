import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { FAKE_LOOKUPS } from "../support/fake-area-items.js";
import type { SeedSavedSearch } from "../support/fake-saved-search-handlers.js";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { matchShellAtBothSizes, THEMES } from "../support/screenshots.js";

const priorityId = (name: string) =>
  FAKE_LOOKUPS.priorityLevels.find((level) => level.name === name)!.id;

const homeHeading = () => page.getByRole("heading", { name: "Projects", level: 1 });
const searchHeading = () => page.getByRole("heading", { name: "Search", exact: true });
const searchInput = () => page.getByRole("searchbox", { name: "Search text" });
const section = () => page.getByRole("region", { name: "Saved searches" });
const link = (name: string) => section().getByRole("button", { name, exact: true });
const links = () => section().getByTestId("saved-search-link");
const rename = (name: string) =>
  page.getByRole("button", { name: `Rename saved search '${name}'` });
const remove = (name: string) =>
  page.getByRole("button", { name: `Delete saved search '${name}'` });
const dialog = () => page.getByRole("dialog");
const alert = () => page.getByRole("alertdialog");
const searchError = () => page.getByTestId("search-error");
const results = () => page.getByTestId("search-result-row");

const PROJECTS: ReadonlyArray<SeedProject> = [
  {
    name: "Billing DB",
    openCount: 2,
    overdueCount: 1,
    items: [
      { title: "Fix deadlock", priority: "High" },
      { title: "Review invoice indexes", priority: "High", dueDate: "2026-11-12" },
    ],
  },
  { name: "Website", openCount: 1 },
];

async function openHome(saved: (store: FakeProjectStore) => ReadonlyArray<SeedSavedSearch>) {
  const app = await renderApp({
    projects: PROJECTS,
    configure(store) {
      saved(store).forEach((search) => store.savedSearches.add(search));
    },
  });
  await expect.element(homeHeading()).toBeVisible();
  return app;
}

async function answerPrompt(title: string, name: string) {
  await expect.element(dialog()).toHaveAccessibleName(title);
  await dialog().getByRole("textbox").fill(name);
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog()).not.toBeInTheDocument();
}

it("Lists saved searches in stored order and hides the section when there are none", async () => {
  const { store } = await openHome(() => [
    { name: "Overdue", queryText: "due<today" },
    { name: "Errors", queryText: `priority:#${priorityId("High")}` },
  ]);

  await expect.element(links().first()).toMatchTextContent("Overdue");
  expect(
    links()
      .elements()
      .map((element) => element.textContent),
  ).toEqual(["Overdue", "Errors"]);
  store.savedSearches.rows = [];
  await page.getByRole("article", { name: "Website" }).click();
  await page.getByTestId("sidebar-home").click();
  await expect.element(homeHeading()).toBeVisible();
  await expect.element(section()).not.toBeInTheDocument();
});

it("Opens a saved search from Home with the keyboard and Back returns Home", async () => {
  await openHome(() => [{ name: "Errors", queryText: `deadlock priority:#${priorityId("High")}` }]);

  await expect.element(link("Errors")).toBeVisible();
  link("Errors").element().focus();
  await userEvent.keyboard("{Enter}");

  await expect.element(searchHeading()).toBeVisible();
  await expect.element(searchInput()).toHaveValue("deadlock priority:High");
  await expect.element(results()).toHaveLength(1);
  await expect
    .element(page.getByRole("navigation", { name: "Saved searches" }).getByRole("button"))
    .toHaveAttribute("aria-current", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(searchHeading()).not.toBeInTheDocument();
  await expect.element(homeHeading()).toBeVisible();
});

it("A project-scoped saved search opens with that project as its scope", async () => {
  await openHome((store) => [
    {
      name: "Mine",
      queryText: "deadlock",
      scope: { kind: "project", projectId: store.summaries[0]!.project.id },
    },
  ]);

  await link("Mine").click();
  const scope = page.getByRole("combobox", { name: "Search scope" });
  await expect.element(scope).toMatchTextContent("This project");
  await scope.click();

  const options = page.getByRole("option").elements();
  expect(options.map((option) => option.textContent)).toEqual([
    "All projects",
    "This project",
    "Project root only",
  ]);
});

it("Rename and Delete act on the chosen entry and keep focus in the list", async () => {
  const { store } = await openHome(() => [
    { name: "One", queryText: "a" },
    { name: "Two", queryText: "b" },
  ]);

  await rename("Two").click();
  await answerPrompt("Rename saved search", "Renamed");
  await expect.element(link("Renamed")).toBeVisible();
  await expect.element(rename("Renamed")).toHaveFocus();
  await remove("One").click();
  await expect.element(alert()).toMatchTextContent("Delete the saved search 'One'?");
  await alert().getByRole("button", { name: "Delete" }).click();

  await expect.element(link("One")).not.toBeInTheDocument();
  await expect.element(link("Renamed")).toHaveFocus();
  await remove("Renamed").click();
  await alert().getByRole("button", { name: "Delete" }).click();
  await expect.element(section()).not.toBeInTheDocument();
  await expect.element(page.getByTestId("new-project-button")).toHaveFocus();
  expect(store.savedSearches.rows).toEqual([]);
});

it("Opening a saved search deleted meanwhile says so, stays Home and refreshes the list", async () => {
  const { store } = await openHome(() => [
    { name: "Gone", queryText: "a" },
    { name: "Kept", queryText: "b" },
  ]);
  await expect.element(link("Gone")).toBeVisible();
  store.savedSearches.remove(store.savedSearches.rows[0]!.id);

  await link("Gone").click();

  await expect.element(alert()).toMatchTextContent("This saved search no longer exists.");
  await alert().getByRole("button", { name: "OK" }).click();
  await expect.element(link("Gone")).not.toBeInTheDocument();
  await expect.element(link("Kept")).toBeVisible();
  await expect.element(homeHeading()).toBeVisible();
});

it("Returning Home lists a search saved on the Search page and undo removes it", async () => {
  await openHome(() => []);
  await userEvent.keyboard("{Control>}f{/Control}");
  await searchInput().fill("priority:high");

  await page.getByRole("button", { name: "Save search", exact: true }).click();
  await answerPrompt("Save search", "Fresh");
  await userEvent.keyboard("{Escape}");

  await expect.element(link("Fresh")).toBeVisible();
  page.getByTestId("new-project-button").element().focus();
  await userEvent.keyboard("{Control>}z{/Control}");
  await expect.element(section()).not.toBeInTheDocument();
});

it("A saved search whose project was deleted shows an inline error", async () => {
  const { store } = await openHome((seeded) => [
    {
      name: "Doomed tickets",
      queryText: "has:ticket",
      scope: { kind: "project", projectId: seeded.summaries[1]!.project.id },
    },
  ]);
  store.remove(store.summaries[1]!.project.id);

  await link("Doomed tickets").click();

  await expect
    .element(searchError())
    .toMatchTextContent(
      "The saved search 'Doomed tickets' can't be run. Search project does not exist.",
    );
  await expect.element(searchError()).toHaveLength(1);
  await expect.element(searchInput()).toHaveValue("has:ticket");
});

it.each(THEMES)("Renders Home with saved searches in %s mode", async (theme) => {
  await openHome((store) => [
    { name: "Overdue changes", queryText: `priority:#${priorityId("Medium")} due<today` },
    {
      name: "Urgent invoices",
      queryText: "invoice",
      scope: { kind: "project", projectId: store.summaries[0]!.project.id },
    },
    { name: "No ticket", queryText: "no:ticket" },
  ]);
  await expect.element(links()).toHaveLength(3);

  await matchShellAtBothSizes("home-saved-searches", theme);
});
