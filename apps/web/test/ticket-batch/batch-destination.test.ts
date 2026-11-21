import type { FolderProjection, ProjectSummary } from "@task-tracker/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  folderOptions,
  readStoredDestination,
  resolveFolderId,
  resolveProjectId,
  storeDestination,
  TOP_LEVEL,
} from "../../src/ticket-batch/batch-destination.js";

const STORAGE_KEY = "task-tracker.add-tickets-destination";
const at = "2026-11-21T12:00:00Z";

const summary = (id: string, name: string): typeof ProjectSummary.Type => ({
  project: {
    id,
    name,
    description: null,
    iconKey: null,
    sortOrder: 0,
    createdAtUtc: at,
    updatedAtUtc: at,
  },
  openCount: 0,
  overdueCount: 0,
});

const folder = (
  id: string,
  name: string,
  parentFolderId: string | null,
  sortOrder = 0,
): typeof FolderProjection.Type => ({
  id,
  projectId: "p2",
  parentFolderId,
  name,
  sortOrder,
  createdAtUtc: at,
  updatedAtUtc: at,
});

const projects = [summary("p1", "Billing"), summary("p2", "ClockTower")];
const folders = [
  folder("f2", "Office", null, 1),
  folder("f1", "Plant", null),
  folder("f3", "Line 2", "f1"),
];

/** Stands in for the renderer's local storage, which Node lacks without a storage file. */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolving the destination", () => {
  it("Keeps a chosen project and folder that still exist", () => {
    const chosen = { projectId: "p2", folderId: "f3" };

    expect(resolveProjectId(chosen, projects)).toBe("p2");
    expect(resolveFolderId(chosen, "p2", folders)).toBe("f3");
  });

  it("Falls back to the first project and the top level when the choice is gone", () => {
    expect(resolveProjectId({ projectId: "gone", folderId: null }, projects)).toBe("p1");
    expect(resolveProjectId(null, projects)).toBe("p1");
    expect(resolveProjectId(null, [])).toBeNull();
    expect(resolveFolderId({ projectId: "p2", folderId: "gone" }, "p2", folders)).toBeNull();
    expect(resolveFolderId({ projectId: "p1", folderId: "f1" }, "p2", folders)).toBeNull();
  });
});

describe("folderOptions", () => {
  it("Lists the top level, then folders in tree order indented by depth", () => {
    expect(folderOptions(folders)).toEqual([
      { value: TOP_LEVEL, label: "Top level" },
      { value: "f1", label: "Plant" },
      { value: "f3", label: " Line 2" },
      { value: "f2", label: "Office" },
    ]);
  });
});

describe("storage", () => {
  it("Reads back a stored destination and ignores unreadable values", () => {
    storeDestination({ projectId: "p2", folderId: null });

    expect(readStoredDestination()).toEqual({ projectId: "p2", folderId: null });
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readStoredDestination()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId: 3 }));
    expect(readStoredDestination()).toBeNull();
  });
});
