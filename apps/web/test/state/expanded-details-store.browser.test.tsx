import { afterEach, describe, expect, it } from "vitest";
import {
  followExpandedDetails,
  keepExpandedDetails,
  setDetailExpanded,
  useExpandedDetailsStore,
} from "../../src/state/expanded-details-store.js";

const STORAGE_KEY = "task-tracker.expanded-card-details";

const expandedIds = () => [...useExpandedDetailsStore.getState().ids];
const storedIds = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;

afterEach(() => {
  useExpandedDetailsStore.setState({ ids: new Set() });
  localStorage.removeItem(STORAGE_KEY);
});

describe("setDetailExpanded", () => {
  it("Remembers an expanded item in the store and in local storage", () => {
    setDetailExpanded("item-1", true);

    expect(expandedIds()).toEqual(["item-1"]);
    expect(storedIds()).toEqual(["item-1"]);
  });

  it("Forgets the item once it is collapsed", () => {
    setDetailExpanded("item-1", true);
    setDetailExpanded("item-2", true);

    setDetailExpanded("item-1", false);

    expect(expandedIds()).toEqual(["item-2"]);
    expect(storedIds()).toEqual(["item-2"]);
  });
});

describe("keepExpandedDetails", () => {
  it("Forgets expanded items that are no longer in progress", () => {
    setDetailExpanded("item-1", true);
    setDetailExpanded("item-2", true);

    keepExpandedDetails(["item-2", "item-3"]);

    expect(expandedIds()).toEqual(["item-2"]);
    expect(storedIds()).toEqual(["item-2"]);
  });
});

describe("followExpandedDetails", () => {
  it("Reads the set another window stored", () => {
    const unfollow = followExpandedDetails();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["item-9"]));

    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    unfollow();

    expect(expandedIds()).toEqual(["item-9"]);
  });

  it("Ignores stored values that are not a list of IDs", () => {
    const unfollow = followExpandedDetails();
    localStorage.setItem(STORAGE_KEY, "{not json");

    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    unfollow();

    expect(expandedIds()).toEqual([]);
  });
});
