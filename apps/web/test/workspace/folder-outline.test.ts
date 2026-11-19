import { describe, expect, it } from "vitest";
import {
  buildFolderForest,
  type Folder,
  flattenFolderForest,
  folderPath,
  isWithinFolder,
} from "../../src/workspace/folder-outline.js";

const folder = (id: string, parentFolderId: string | null, sortOrder: number): Folder => ({
  id,
  projectId: "P",
  parentFolderId,
  name: id,
  sortOrder,
  createdAtUtc: "2026-11-13T12:00:00Z",
  updatedAtUtc: "2026-11-13T12:00:00Z",
});

const folders = [
  folder("Views", "dbo", 1),
  folder("dbo", null, 0),
  folder("Tables", "dbo", 0),
  folder("Archive", null, 1),
  folder("Invoices", "Tables", 0),
];

describe("buildFolderForest", () => {
  it("Nests folders under their parents in sibling order", () => {
    const forest = buildFolderForest(folders);

    const shape = forest.map((node) => [
      node.folder.id,
      node.children.map((child) => child.folder.id),
    ]);

    expect(shape).toEqual([
      ["dbo", ["Tables", "Views"]],
      ["Archive", []],
    ]);
  });
});

describe("flattenFolderForest", () => {
  it("Lists folders depth first with their depth", () => {
    const forest = buildFolderForest(folders);

    const flat = flattenFolderForest(forest).map((node) => `${node.depth}:${node.folder.id}`);

    expect(flat).toEqual(["0:dbo", "1:Tables", "2:Invoices", "1:Views", "0:Archive"]);
  });
});

describe("folderPath", () => {
  it("Returns the folders from the top level down to the folder", () => {
    const path = folderPath(folders, "Invoices").map((entry) => entry.id);

    expect(path).toEqual(["dbo", "Tables", "Invoices"]);
  });

  it("Returns no folders for a folder missing from the snapshot", () => {
    const path = folderPath(folders, "Deleted");

    expect(path).toEqual([]);
  });
});

describe("isWithinFolder", () => {
  it("Treats a folder and its descendants as within it", () => {
    const within = ["dbo", "Invoices", "Archive"].map((id) => isWithinFolder(folders, id, "dbo"));

    expect(within).toEqual([true, true, false]);
  });
});
