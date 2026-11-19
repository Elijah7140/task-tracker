import { beforeEach, describe, expect, it } from "vitest";
import { initialReturnPageState, useReturnPageStore } from "../../src/state/return-page-store.js";

const state = () => useReturnPageStore.getState();
const PROJECT = "0190A1B2-0000-7000-8000-000000000001";
const FOLDER = "0190A1B2-0000-7000-8000-000000000002";
const OTHER = "0190A1B2-0000-7000-8000-000000000003";

describe("useReturnPageStore", () => {
  beforeEach(() => {
    useReturnPageStore.setState(initialReturnPageState);
  });

  it("Covers the routed page and remembers where it was opened", () => {
    state().cover("calendar", PROJECT);

    expect(state()).toMatchObject({ covering: "calendar", originProjectId: PROJECT, stale: false });
  });

  it("Replaces one covering page with another and keeps the original return target", () => {
    state().cover("trash", PROJECT);
    state().markStale();

    state().cover("calendar", null);

    expect(state()).toMatchObject({ covering: "calendar", originProjectId: PROJECT, stale: true });
  });

  it("Keeps a covering page that is opened again", () => {
    state().cover("calendar", PROJECT);
    const before = state();

    state().cover("calendar", null);

    expect(state()).toBe(before);
  });

  it("Ignores a new covering page while a change is running", () => {
    state().cover("trash", null);
    state().setBusy(true);

    state().cover("calendar", null);

    expect(state().covering).toBe("trash");
  });

  it("Clears the covering page and its flags", () => {
    state().cover("calendar", PROJECT);
    state().markStale();

    state().uncover();

    expect(state()).toMatchObject(initialReturnPageState);
  });

  it("Records the originating project and folder when a page first covers", () => {
    state().cover("search", PROJECT, FOLDER);

    expect(state()).toMatchObject({
      covering: "search",
      originProjectId: PROJECT,
      originFolderId: FOLDER,
    });
  });

  it("Keeps the original return page and stale flag when switching covering pages", () => {
    state().cover("trash", PROJECT, null);
    state().markStale();

    state().cover("search", OTHER, FOLDER);

    expect(state()).toMatchObject({
      covering: "search",
      originProjectId: PROJECT,
      originFolderId: null,
      stale: true,
    });
  });

  it("Stays on the current covering page while a change is running", () => {
    state().cover("trash", PROJECT);
    state().setBusy(true);

    state().cover("search", PROJECT);

    expect(state().covering).toBe("trash");
  });

  describe("openSavedSearch", () => {
    const saved = (name: string) => ({
      id: `0190A1B2-0000-7000-8000-00000000010${name.length}`,
      name,
      queryText: "type:error",
      scope: { kind: "allProjects" as const },
      includeCompleted: false,
    });

    it("Covers with Search, the saved search and its scope origin", () => {
      state().openSavedSearch(saved("Errors"), PROJECT, FOLDER);

      expect(state()).toMatchObject({
        covering: "search",
        originProjectId: PROJECT,
        originFolderId: FOLDER,
        searchRequest: { savedSearch: saved("Errors"), version: 1 },
      });
    });

    it("Replaces an open Search page and keeps the return page's out-of-date flag", () => {
      state().cover("search", PROJECT);
      state().markStale();

      state().openSavedSearch(saved("Errors"), OTHER, null);
      state().openSavedSearch(saved("Mine"), null, null);

      expect(state()).toMatchObject({
        covering: "search",
        originProjectId: null,
        stale: true,
        searchRequest: { savedSearch: saved("Mine"), version: 2 },
      });
    });

    it("Forgets the saved search when Search closes or another page covers", () => {
      state().openSavedSearch(saved("Errors"), null, null);
      state().cover("calendar", null);
      const switched = state().searchRequest;
      state().openSavedSearch(saved("Errors"), null, null);

      state().uncover();

      expect(switched).toBeNull();
      expect(state().searchRequest).toBeNull();
    });

    it("Ignores a saved search while a change is running", () => {
      state().cover("search", PROJECT);
      state().setBusy(true);

      state().openSavedSearch(saved("Errors"), OTHER, null);

      expect(state()).toMatchObject({ originProjectId: PROJECT, searchRequest: null });
    });
  });
});
