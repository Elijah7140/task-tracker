import { expect, it } from "@effect/vitest";
import {
  arrangeSavedSearches,
  createSavedSearch,
  findSavedSearchByName,
  nextSavedSearchSortOrder,
  repeatedSavedSearchName,
  renameSavedSearch,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  savedSearchName,
  updateSavedSearch,
  type SavedSearch,
  type SavedSearchDefinition,
  type SearchScope,
} from "../../src/index.js";
import { now } from "../fixtures.js";

const allProjects: SearchScope = { kind: "allProjects" };
const definition = (scope: SearchScope = allProjects): SavedSearchDefinition => ({
  queryText: "due<today",
  scope,
  includeCompleted: false,
});
const saved = (id: string, name: string, sortOrder: number): SavedSearch =>
  createSavedSearch(id, name, definition(), now, sortOrder);

it("Trims a name and refuses a blank or overlong one", () => {
  const search = createSavedSearch("a", "  Overdue  ", definition(), now, 0);

  expect(search.name).toBe("Overdue");
  expect(() => savedSearchName("   ")).toThrow("Name must be 1 to 300 characters.");
  expect(() => savedSearchName("x".repeat(301))).toThrow("Name must be 1 to 300 characters.");
});

it.each<SearchScope>([
  { kind: "allProjects" },
  { kind: "project", projectId: "P" },
  { kind: "area", projectId: "P", folderId: "F", includeSubfolders: true },
  { kind: "area", projectId: "P", folderId: "F", includeSubfolders: false },
  { kind: "area", projectId: "P", folderId: null, includeSubfolders: false },
])("Keeps the %o scope", (scope) => {
  const search = createSavedSearch("a", "Mine", definition(scope), now, 0);

  expect(search.scope).toEqual(scope);
});

it("Updating replaces query, scope and completed switch and touches only the update time", () => {
  const later = now.add({ hours: 1 });
  const search = createSavedSearch(
    "a",
    "Mine",
    definition({ kind: "project", projectId: "P" }),
    now,
    3,
  );

  const updated = updateSavedSearch(
    search,
    { queryText: "is:done", scope: allProjects, includeCompleted: true },
    later,
  );

  expect(updated).toEqual({
    ...search,
    queryText: "is:done",
    scope: allProjects,
    includeCompleted: true,
    updatedAtUtc: later,
  });
});

it("Refuses an overlong query", () => {
  const long = { ...definition(), queryText: "x".repeat(SAVED_SEARCH_QUERY_MAX_LENGTH + 1) };

  expect(() => createSavedSearch("a", "Mine", long, now, 0)).toThrow(
    "A saved search can hold at most 4000 characters of query.",
  );
});

it("Renaming trims the name and touches the update time", () => {
  const later = now.add({ minutes: 5 });

  const renamed = renameSavedSearch(saved("a", "Old", 0), "  New ", later);

  expect(renamed.name).toBe("New");
  expect(renamed.updatedAtUtc).toEqual(later);
});

it("Finds a name ignoring case and can skip the search being renamed", () => {
  const all = [saved("a", "Overdue", 0), saved("b", "Straße", 1)];

  expect(findSavedSearchByName(all, "OVERDUE", null)?.id).toBe("a");
  expect(findSavedSearchByName(all, "STRASSE", null)).toBeUndefined();
  expect(findSavedSearchByName(all, "straße", null)?.id).toBe("b");
  expect(findSavedSearchByName(all, "overdue", "a")).toBeUndefined();
});

it("Puts a new search after the existing ones", () => {
  expect(nextSavedSearchSortOrder([])).toBe(0);
  expect(nextSavedSearchSortOrder([saved("a", "A", 4), saved("b", "B", 2)])).toBe(5);
});

it("Puts listed searches first and keeps the rest in order", () => {
  const all = [saved("a", "A", 0), saved("b", "B", 1), saved("c", "C", 2)];

  const arranged = arrangeSavedSearches(all, ["c"]);

  expect(arranged.map((search) => [search.id, search.sortOrder])).toEqual([
    ["c", 0],
    ["a", 1],
    ["b", 2],
  ]);
});

it.each([[["a", "a"]], [["z"]]])("Refuses an order of %o", (ids) => {
  const all = [saved("a", "A", 0), saved("b", "B", 1)];

  expect(() => arrangeSavedSearches(all, ids)).toThrow(
    "The new order names a saved search that does not exist or repeats one.",
  );
});

it("Reports the first name that repeats another ignoring case", () => {
  expect(repeatedSavedSearchName(["Über", "Mine", "ÜBER"])).toBe("ÜBER");
  expect(repeatedSavedSearchName(["Straße", "STRASSE"])).toBeUndefined();
});
