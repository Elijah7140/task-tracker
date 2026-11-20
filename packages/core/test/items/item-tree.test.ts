import { expect, it } from "@effect/vitest";
import { HierarchyError, FolderTree, ItemTree } from "../../src/index.js";
import { earlier, folder, item, now, projectId } from "../fixtures.js";

function areaTrees() {
  const folders = new FolderTree(projectId, [folder("area")]);
  const source = new ItemTree(projectId, null, [
    item("root"),
    item("child", { parentItemId: "root" }),
    item("grandchild", { parentItemId: "child" }),
  ]);
  const destination = new ItemTree(projectId, "area", [], folders);
  return { source, destination };
}

it("moves deleted descendants with their root and restores them in the new area", () => {
  const { source, destination } = areaTrees();
  source.deleteSubtree("child", "first-batch", earlier);

  source.moveTopLevelTo("root", destination, now);
  destination.restoreBatch("first-batch", now);

  expect(source.allRows).toEqual([]);
  expect(destination.all).toHaveLength(3);
  expect(destination.all.every((row) => row.folderId === "area")).toBe(true);
  expect(destination.get("child")).toMatchObject({ deletionBatchId: null, deletedAtUtc: null });
  expect(destination.get("grandchild").parentItemId).toBe("child");
});

it("preserves an earlier deletion batch when moving a root", () => {
  const { source, destination } = areaTrees();
  source.deleteSubtree("child", "first-batch", earlier);

  source.moveTopLevelTo("root", destination, now);

  expect(destination.allRows).toContainEqual(
    expect.objectContaining({
      id: "child",
      folderId: "area",
      deletionBatchId: "first-batch",
      deletedAtUtc: earlier,
    }),
  );
});

it("preserves an earlier child batch when deleting its parent", () => {
  const { source } = areaTrees();
  source.deleteSubtree("child", "first-batch", earlier);

  source.deleteSubtree("root", "second-batch", now);

  expect(source.allRows.map((row) => [row.id, row.deletionBatchId])).toEqual([
    ["root", "second-batch"],
    ["child", "first-batch"],
    ["grandchild", "first-batch"],
  ]);
  expect(source.all).toEqual([]);
});

it("reparents and outdents an item within the area", () => {
  const tree = new ItemTree(projectId, null, [
    item("root"),
    item("sibling", { sortOrder: 1 }),
    item("child", { parentItemId: "root" }),
  ]);

  tree.move("child", "sibling", now);
  expect(tree.get("child").parentItemId).toBe("sibling");

  tree.outdent("child", now);

  expect(tree.get("child").parentItemId).toBeNull();
});

it("rejects self, descendant, cross-project and non-root area moves", () => {
  const { source, destination } = areaTrees();
  const otherProject = new ItemTree("other-project", null, []);
  const before = source.allRows;

  expect(() => source.move("root", "root", now)).toThrow(HierarchyError);
  expect(() => source.move("root", "child", now)).toThrow(HierarchyError);
  expect(() => source.moveTopLevelTo("root", otherProject, now)).toThrow(HierarchyError);
  expect(() => source.moveTopLevelTo("child", destination, now)).toThrow(HierarchyError);
  expect(source.allRows).toEqual(before);
});

it("rejects rows with missing parents or another project or area", () => {
  const root = item("root");
  const missingParent = item("missing", { parentItemId: "unknown" });
  const otherProject = item("foreign", { projectId: "other" });
  const otherArea = item("elsewhere", { parentItemId: root.id, folderId: "area" });

  expect(() => new ItemTree(projectId, null, [missingParent])).toThrow(/parent is missing/);
  expect(() => new ItemTree(projectId, null, [otherProject])).toThrow(/another area/);
  expect(() => new ItemTree(projectId, null, [root, otherArea])).toThrow(/another area/);
});

it("rejects cycles in loaded item rows", () => {
  const root = item("root", { parentItemId: "child" });
  const child = item("child", { parentItemId: root.id });

  expect(() => new ItemTree(projectId, null, [root, child])).toThrow(/cycle detected/);
});

it("requires an active area folder in the same project", () => {
  const deleted = folder("deleted", { deletedAtUtc: now, deletionBatchId: "batch" });
  const folders = new FolderTree(projectId, [deleted, folder("active")]);

  expect(() => new ItemTree(projectId, "unknown", [], folders)).toThrow(
    expect.objectContaining({ entity: "Folder" }),
  );
  expect(() => new ItemTree(projectId, deleted.id, [], folders)).toThrow(
    expect.objectContaining({ entity: "Folder" }),
  );
  expect(() => new ItemTree("other", "active", [], folders)).toThrow(HierarchyError);
});

it("requires an active parent when loading or adding active children", () => {
  const parent = item("parent", { deletedAtUtc: now, deletionBatchId: "batch" });
  const child = item("child", { parentItemId: parent.id });
  const tree = new ItemTree(projectId, null, [parent]);

  expect(() => new ItemTree(projectId, null, [parent, child])).toThrow(HierarchyError);
  expect(() => tree.add(child, now)).toThrow(expect.objectContaining({ entity: "Item" }));
});

it("blocks restoring an earlier item batch until its parent is restored", () => {
  const { source } = areaTrees();
  source.deleteSubtree("child", "first-batch", earlier);
  source.deleteSubtree("root", "second-batch", now);
  const before = source.allRows;

  expect(() => source.restoreBatch("first-batch", now)).toThrow(HierarchyError);
  expect(source.allRows).toEqual(before);

  source.restoreBatch("second-batch", now);
  expect(source.all.map((row) => row.id)).toEqual(["root"]);
  source.restoreBatch("first-batch", now);

  expect(source.all.map((row) => row.id)).toEqual(["root", "child", "grandchild"]);
});

it("keeps sibling ranks contiguous after indenting, moving areas, and adding", () => {
  const { source, destination } = areaTrees();
  source.add(item("second"), now);
  source.add(item("third"), now);
  destination.add(item("existing", { folderId: "area" }), now);

  source.indent("third", now);
  source.moveTopLevelTo("second", destination, now);
  source.add(item("last"), now);

  expect(source.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["root", 0],
    ["last", 1],
  ]);
  expect(destination.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["existing", 0],
    ["second", 1],
  ]);
  expect(destination.get("third").parentItemId).toBe("second");
});

it("only reorders a complete permutation of active siblings", () => {
  const { source } = areaTrees();
  source.add(item("sibling"), now);
  source.deleteSubtree("grandchild", "batch", now);

  expect(() => source.reorder(null, ["root"], now)).toThrow(HierarchyError);
  expect(() => source.reorder(null, ["root", "root"], now)).toThrow(HierarchyError);
  expect(() => source.reorder(null, ["root", "child"], now)).toThrow(HierarchyError);
  expect(source.children(null).map((row) => row.id)).toEqual(["root", "sibling"]);

  source.reorder(null, ["sibling", "root"], now);

  expect(source.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["sibling", 0],
    ["root", 1],
  ]);
});

it("places an outdented item immediately after its former parent", () => {
  const tree = new ItemTree(projectId, null, [
    item("parent"),
    item("later", { sortOrder: 1 }),
    item("child", { parentItemId: "parent" }),
  ]);

  tree.outdent("child", now);

  expect(tree.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["parent", 0],
    ["child", 1],
    ["later", 2],
  ]);
});

it("moves an item to an index among its new siblings and renumbers both lists", () => {
  const tree = new ItemTree(projectId, null, [
    item("first"),
    item("second", { sortOrder: 1 }),
    item("child-a", { parentItemId: "first" }),
    item("child-b", { parentItemId: "first", sortOrder: 1 }),
    item("child-c", { parentItemId: "first", sortOrder: 2 }),
  ]);

  tree.moveAt("child-b", null, 1, now);

  expect(tree.children(null).map((row) => [row.id, row.sortOrder])).toEqual([
    ["first", 0],
    ["child-b", 1],
    ["second", 2],
  ]);
  expect(tree.children("first").map((row) => [row.id, row.sortOrder])).toEqual([
    ["child-a", 0],
    ["child-c", 1],
  ]);
});

it("rejects an index outside the destination siblings", () => {
  const tree = new ItemTree(projectId, null, [item("first"), item("second", { sortOrder: 1 })]);

  expect(() => tree.moveAt("first", null, 2, now)).toThrow(HierarchyError);
  expect(() => tree.moveAt("first", null, -1, now)).toThrow(HierarchyError);
  expect(tree.children(null).map((row) => row.id)).toEqual(["first", "second"]);
});

it("Replaces an item's fields without moving it", () => {
  const tree = new ItemTree(projectId, null, [item("first"), item("second", { sortOrder: 1 })]);

  tree.replace({ ...tree.get("first"), title: "Renamed" });

  expect(tree.children(null).map((row) => row.title)).toEqual(["Renamed", "Task"]);
  expect(() => tree.replace({ ...tree.get("second"), sortOrder: 0 })).toThrow(
    "Item replacement cannot move it.",
  );
});
