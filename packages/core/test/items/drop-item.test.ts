import { expect, it } from "@effect/vitest";
import { dropItem, HierarchyError, ItemTree } from "../../src/index.js";
import { earlier, item, now, projectId } from "../fixtures.js";

const order = (tree: ItemTree, parentId: string | null) =>
  tree.children(parentId).map((row) => [row.id, row.sortOrder]);

function rootsWithChildren() {
  return new ItemTree(projectId, null, [
    item("first"),
    item("second", { sortOrder: 1 }),
    item("third", { sortOrder: 2 }),
    item("child-a", { parentItemId: "first" }),
    item("child-b", { parentItemId: "first", sortOrder: 1 }),
    item("grandchild", { parentItemId: "child-b" }),
  ]);
}

it("promotes a sub-item before a top-level row with its subtree", () => {
  const tree = rootsWithChildren();

  dropItem(tree, "child-b", "second", "before", now);

  expect(order(tree, null)).toEqual([
    ["first", 0],
    ["child-b", 1],
    ["second", 2],
    ["third", 3],
  ]);
  expect(order(tree, "first")).toEqual([["child-a", 0]]);
  expect(tree.get("grandchild").parentItemId).toBe("child-b");
});

it("places an item after a row under that row's parent", () => {
  const tree = rootsWithChildren();

  dropItem(tree, "third", "child-a", "after", now);

  expect(order(tree, "first")).toEqual([
    ["child-a", 0],
    ["third", 1],
    ["child-b", 2],
  ]);
  expect(order(tree, null)).toEqual([
    ["first", 0],
    ["second", 1],
  ]);
});

it("appends an item into a row as its last sub-item", () => {
  const tree = rootsWithChildren();

  dropItem(tree, "second", "first", "into", now);

  expect(order(tree, "first")).toEqual([
    ["child-a", 0],
    ["child-b", 1],
    ["second", 2],
  ]);
});

it("reorders open siblings around a finished sibling that keeps its slot", () => {
  const tree = new ItemTree(projectId, null, [
    item("alpha"),
    item("done", { sortOrder: 1, completedAtUtc: earlier }),
    item("beta", { sortOrder: 2 }),
    item("gamma", { sortOrder: 3 }),
  ]);

  dropItem(tree, "alpha", "gamma", "after", now);

  expect(order(tree, null)).toEqual([
    ["beta", 0],
    ["done", 1],
    ["gamma", 2],
    ["alpha", 3],
  ]);
});

it("rejects drops onto the item itself or any of its descendants", () => {
  const tree = rootsWithChildren();

  for (const [target, position] of [
    ["first", "before"],
    ["child-b", "into"],
    ["grandchild", "after"],
  ] as const) {
    expect(() => dropItem(tree, "first", target, position, now)).toThrow(HierarchyError);
  }
  expect(order(tree, null)).toEqual([
    ["first", 0],
    ["second", 1],
    ["third", 2],
  ]);
});

it("rejects insertion edges that involve a finished row but accepts into drops", () => {
  const tree = new ItemTree(projectId, null, [
    item("open"),
    item("done", { sortOrder: 1, completedAtUtc: earlier }),
    item("also-done", { sortOrder: 2, completedAtUtc: earlier }),
  ]);

  for (const position of ["before", "after"] as const) {
    expect(() => dropItem(tree, "open", "done", position, now)).toThrow(HierarchyError);
    expect(() => dropItem(tree, "done", "open", position, now)).toThrow(HierarchyError);
    expect(() => dropItem(tree, "done", "also-done", position, now)).toThrow(HierarchyError);
  }
  dropItem(tree, "open", "done", "into", now);
  dropItem(tree, "also-done", "done", "into", now);

  expect(order(tree, "done")).toEqual([
    ["open", 0],
    ["also-done", 1],
  ]);
});
