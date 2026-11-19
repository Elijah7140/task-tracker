import { beforeEach, describe, expect, it } from "vitest";
import { initialReturnPageState, useReturnPageStore } from "../../src/state/return-page-store.js";

const PROJECT = "0190A1B2-0000-7000-8000-000000000001";
const FOLDER = "0190A1B2-0000-7000-8000-000000000002";
const OTHER = "0190A1B2-0000-7000-8000-000000000003";

describe("useReturnPageStore", () => {
  beforeEach(() => useReturnPageStore.setState(initialReturnPageState));

  it("Records the originating project and folder when a page first covers", () => {
    useReturnPageStore.getState().cover("search", PROJECT, FOLDER);

    expect(useReturnPageStore.getState()).toMatchObject({
      covering: "search",
      originProjectId: PROJECT,
      originFolderId: FOLDER,
    });
  });

  it("Keeps the original return page and stale flag when switching covering pages", () => {
    const store = useReturnPageStore.getState();
    store.cover("trash", PROJECT, null);
    store.markStale();

    useReturnPageStore.getState().cover("search", OTHER, FOLDER);

    expect(useReturnPageStore.getState()).toMatchObject({
      covering: "search",
      originProjectId: PROJECT,
      originFolderId: null,
      stale: true,
    });
  });

  it("Stays on the current covering page while a change is running", () => {
    useReturnPageStore.getState().cover("trash", PROJECT);
    useReturnPageStore.getState().setBusy(true);

    useReturnPageStore.getState().cover("search", PROJECT);

    expect(useReturnPageStore.getState().covering).toBe("trash");
  });
});
