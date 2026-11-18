import { expect, it } from "@effect/vitest";
import { HierarchyError, FolderTree } from "../../src/index.js";
import { earlier, folder, now, projectId } from "../fixtures.js";

function branch() {
  return new FolderTree(projectId, [folder("root"), folder("child", { parentFolderId: "root" })]);
}

it("rejects moving a folder into a descendant", () => {
  const tree = branch();

  expect(() => tree.move("root", "child", now)).toThrow(HierarchyError);
});

it("stamps an active folder subtree with one deletion batch", () => {
  const tree = branch();

  tree.deleteSubtree("root", "batch", now);

  expect(tree.allRows).toHaveLength(2);
  expect(tree.allRows.every((row) => row.deletionBatchId === "batch")).toBe(true);
  expect(tree.children(null)).toEqual([]);
});

it("preserves an earlier child batch when deleting its parent", () => {
  const tree = branch();
  tree.deleteSubtree("child", "first-batch", earlier);

  tree.deleteSubtree("root", "second-batch", now);

  expect(tree.allRows.map((row) => [row.id, row.deletionBatchId])).toEqual([
    ["root", "second-batch"],
    ["child", "first-batch"],
  ]);
});

it("clears both deletion fields when restoring a folder", () => {
  const tree = branch();
  tree.deleteSubtree("root", "batch", earlier);

  tree.restoreBatch("batch", now);

  expect(tree.all).toHaveLength(2);
  expect(tree.all.every((row) => row.deletedAtUtc === null && row.deletionBatchId === null)).toBe(
    true,
  );
});

it("blocks restoring a folder while its parent remains deleted", () => {
  const tree = branch();
  tree.deleteSubtree("child", "first-batch", earlier);
  tree.deleteSubtree("root", "second-batch", now);

  expect(() => tree.restoreBatch("first-batch", now)).toThrow("Restore the parent folder first.");
  tree.restoreBatch("second-batch", now);

  expect(tree.all.map((row) => row.id)).toEqual(["root"]);
  expect(tree.allRows).toContainEqual(
    expect.objectContaining({ id: "child", deletionBatchId: "first-batch", deletedAtUtc: earlier }),
  );
});

it("rejects self, missing, cross-project, and deleted folder parents", () => {
  const tree = branch();
  tree.deleteSubtree("child", "batch", now);
  const foreign = folder("foreign", { projectId: "other" });
  const orphan = folder("orphan", { parentFolderId: foreign.id });

  expect(() => tree.move("root", "root", now)).toThrow(HierarchyError);
  expect(() => tree.move("root", "child", now)).toThrow(HierarchyError);
  expect(() => tree.move("root", foreign.id, now)).toThrow(HierarchyError);
  expect(() => new FolderTree(projectId, [orphan])).toThrow(HierarchyError);
  expect(() => new FolderTree(projectId, [orphan, foreign])).toThrow(HierarchyError);
});

it("appends moved folders and keeps both sibling lists contiguous", () => {
  const tree = new FolderTree(projectId, [
    folder("first", { sortOrder: 1 }),
    folder("second", { sortOrder: 4 }),
    folder("third", { sortOrder: 5 }),
    folder("nested", { parentFolderId: "second", sortOrder: 10 }),
  ]);

  tree.move("first", "second", now);
  tree.add(folder("fourth"), now);

  expect(tree.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["second", 0],
    ["third", 1],
    ["fourth", 2],
  ]);
  expect(tree.children("second").map((row) => [row.id, row.sortOrder])).toEqual([
    ["nested", 0],
    ["first", 1],
  ]);
});

it("renumbers an explicitly reordered set of active sibling folders", () => {
  const tree = branch();
  tree.add(folder("other"), now);

  expect(() => tree.reorder(null, ["root", "child"], now)).toThrow(HierarchyError);
  tree.reorder(null, ["other", "root"], now);

  expect(tree.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["other", 0],
    ["root", 1],
  ]);
});
