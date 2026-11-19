import { describe, expect, it } from "vitest";
import {
  canIndentNode,
  findItemNode,
  findItemTitle,
  flattenItemNodes,
  itemAncestorIds,
  type ItemNode,
  precedingOpenSibling,
  siblingNodesOf,
  splitFinished,
} from "../../src/workspace/item-outline.js";

const node = (
  title: string,
  options: {
    parentItemId?: string | null;
    completedAtUtc?: string;
    isFinished?: boolean;
    children?: Array<ItemNode>;
  } = {},
): ItemNode => ({
  item: {
    id: title,
    projectId: "P",
    folderId: null,
    parentItemId: options.parentItemId ?? null,
    title,
    description: null,
    ticketNumber: null,
    itemTypeId: null,
    priorityLevelId: null,
    dueDate: null,
    dueTime: null,
    scheduledStart: null,
    scheduledEnd: null,
    sortOrder: 0,
    createdAtUtc: "2026-11-13T12:00:00Z",
    updatedAtUtc: "2026-11-13T12:00:00Z",
    completedAtUtc: options.completedAtUtc ?? null,
    deletedAtUtc: null,
    deletionBatchId: null,
  },
  ownUrgency: "None",
  displayedUrgency: { value: "None", sourceDescendantId: null },
  isFinished: options.isFinished ?? false,
  children: options.children ?? [],
});

describe("splitFinished", () => {
  it("Keeps open items in sibling order and lists finished items newest first", () => {
    const nodes = [
      node("Old", { completedAtUtc: "2026-11-10T09:00:00Z", isFinished: true }),
      node("First open"),
      node("Newest", { completedAtUtc: "2026-11-12T09:00:00.5Z", isFinished: true }),
      node("Second open"),
      node("Middle", { completedAtUtc: "2026-11-12T09:00:00Z", isFinished: true }),
    ];

    const { open, finished } = splitFinished(nodes);

    expect(open.map((entry) => entry.item.title)).toEqual(["First open", "Second open"]);
    expect(finished.map((entry) => entry.item.title)).toEqual(["Newest", "Middle", "Old"]);
  });

  it("Keeps a completed parent with open work in the open list", () => {
    const parent = node("Parent", { completedAtUtc: "2026-11-12T09:00:00Z", isFinished: false });

    const { open, finished } = splitFinished([parent]);

    expect(open).toEqual([parent]);
    expect(finished).toEqual([]);
  });
});

describe("findItemTitle", () => {
  it("Finds a nested item's title", () => {
    const tree = [
      node("Parent", { children: [node("Child", { children: [node("Grandchild")] })] }),
    ];

    const title = findItemTitle(tree, "Grandchild");

    expect(title).toBe("Grandchild");
  });

  it("Returns undefined for an unknown item", () => {
    const title = findItemTitle([node("Parent")], "Missing");

    expect(title).toBeUndefined();
  });
});

describe("findItemNode", () => {
  it("Finds root and deeply nested nodes and returns undefined when absent", () => {
    const grandchild = node("Grandchild", { parentItemId: "Child" });
    const child = node("Child", { parentItemId: "Parent", children: [grandchild] });
    const tree = [node("Parent", { children: [child] })];

    expect(findItemNode(tree, "Parent")?.item.id).toBe("Parent");
    expect(findItemNode(tree, "Grandchild")).toBe(grandchild);
    expect(findItemNode(tree, "Missing")).toBeUndefined();
  });
});

describe("itemAncestorIds", () => {
  it("Returns ancestor IDs from root down to the direct parent", () => {
    const grandchild = node("Grandchild", { parentItemId: "Child" });
    const child = node("Child", { parentItemId: "Parent", children: [grandchild] });
    const tree = [node("Parent", { children: [child] })];

    expect(itemAncestorIds(tree, "Grandchild")).toEqual(["Parent", "Child"]);
    expect(itemAncestorIds(tree, "Parent")).toEqual([]);
  });
});

describe("siblingNodesOf", () => {
  it("Returns root nodes for null parent and child nodes for a parent ID", () => {
    const child = node("Child", { parentItemId: "Parent" });
    const parent = node("Parent", { children: [child] });
    const tree = [parent, node("Other")];

    expect(siblingNodesOf(tree, null)).toBe(tree);
    expect(siblingNodesOf(tree, "Parent")).toEqual([child]);
    expect(siblingNodesOf(tree, "Missing")).toEqual([]);
  });
});

describe("flattenItemNodes", () => {
  it("Lists items depth first with their nesting depth", () => {
    const tree = [
      node("Parent", {
        children: [node("Child", { parentItemId: "Parent", children: [node("Leaf")] })],
      }),
      node("Second"),
    ];

    const flat = flattenItemNodes(tree).map((entry) => `${entry.depth}:${entry.node.item.id}`);

    expect(flat).toEqual(["0:Parent", "1:Child", "2:Leaf", "0:Second"]);
  });
});

describe("canIndentNode and precedingOpenSibling", () => {
  it("Rejects finished items and the first open sibling, and skips finished siblings", () => {
    const first = node("First");
    const done = node("Done", { completedAtUtc: "2026-11-12T09:00:00Z", isFinished: true });
    const third = node("Third");
    const tree = [first, done, third];

    expect(canIndentNode(tree, first)).toBe(false);
    expect(canIndentNode(tree, done)).toBe(false);
    expect(canIndentNode(tree, third)).toBe(true);
    expect(precedingOpenSibling(tree, third)).toBe(first);
  });
});
