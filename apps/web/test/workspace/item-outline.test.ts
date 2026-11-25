import { describe, expect, it } from "vitest";
import {
  allSiblings,
  canIndentNode,
  EMPTY_SIBLINGS,
  findItemNode,
  findItemTitle,
  flattenItemNodes,
  isEmptyLevel,
  itemAncestorIds,
  type ItemNode,
  type ItemSiblings,
  persistedSiblingOrder,
  precedingOpenSibling,
  siblingNodesOf,
} from "../../src/workspace/item-outline.js";

const level = (
  open: ReadonlyArray<ItemNode>,
  finished: ReadonlyArray<ItemNode> = [],
): ItemSiblings => ({ open, finished });

const node = (
  title: string,
  options: {
    parentItemId?: string | null;
    completedAtUtc?: string;
    isFinished?: boolean;
    sortOrder?: number;
    children?: ItemSiblings;
  } = {},
): ItemNode => ({
  item: {
    id: title,
    projectId: "P",
    folderId: null,
    parentItemId: options.parentItemId ?? null,
    title,
    description: null,
    notes: null,
    ticketNumber: null,
    priorityLevelId: null,
    dueDate: null,
    dueTime: null,
    sortOrder: options.sortOrder ?? 0,
    createdAtUtc: "2026-11-13T12:00:00Z",
    updatedAtUtc: "2026-11-13T12:00:00Z",
    statusId: null,
    reopenStatusId: null,
    completedAtUtc: options.completedAtUtc ?? null,
    deletedAtUtc: null,
    deletionBatchId: null,
  },
  ownUrgency: "None",
  displayedUrgency: { value: "None", sourceDescendantId: null },
  isFinished: options.isFinished ?? false,
  showsDetailOnCard: false,
  children: options.children ?? EMPTY_SIBLINGS,
});

describe("allSiblings and isEmptyLevel", () => {
  it("Lists open items before finished items and treats a level with either as non-empty", () => {
    const open = node("Open");
    const done = node("Done", { completedAtUtc: "2026-11-12T09:00:00Z", isFinished: true });

    const listed = allSiblings(level([open], [done]));

    expect(listed).toEqual([open, done]);
    expect(isEmptyLevel(level([], [done]))).toBe(false);
    expect(isEmptyLevel(EMPTY_SIBLINGS)).toBe(true);
  });
});

describe("persistedSiblingOrder", () => {
  it("Interleaves open and finished siblings by their saved sort order", () => {
    const siblings = level(
      [node("First", { sortOrder: 0 }), node("Third", { sortOrder: 2 })],
      [
        node("Newest", { sortOrder: 3, isFinished: true }),
        node("Older", { sortOrder: 1, isFinished: true }),
      ],
    );

    const ids = persistedSiblingOrder(siblings);

    expect(ids).toEqual(["First", "Older", "Third", "Newest"]);
  });
});

describe("findItemTitle", () => {
  it("Finds a nested item's title", () => {
    const tree = level([
      node("Parent", {
        children: level([node("Child", { children: level([node("Grandchild")]) })]),
      }),
    ]);

    const title = findItemTitle(tree, "Grandchild");

    expect(title).toBe("Grandchild");
  });

  it("Returns undefined for an unknown item", () => {
    const title = findItemTitle(level([node("Parent")]), "Missing");

    expect(title).toBeUndefined();
  });
});

describe("findItemNode", () => {
  it("Finds root, finished and deeply nested nodes and returns undefined when absent", () => {
    const grandchild = node("Grandchild", { parentItemId: "Child" });
    const child = node("Child", { parentItemId: "Parent", children: level([], [grandchild]) });
    const tree = level([node("Parent", { children: level([child]) })]);

    expect(findItemNode(tree, "Parent")?.item.id).toBe("Parent");
    expect(findItemNode(tree, "Grandchild")).toBe(grandchild);
    expect(findItemNode(tree, "Missing")).toBeUndefined();
  });
});

describe("itemAncestorIds", () => {
  it("Returns ancestor IDs from root down to the direct parent", () => {
    const grandchild = node("Grandchild", { parentItemId: "Child" });
    const child = node("Child", { parentItemId: "Parent", children: level([grandchild]) });
    const tree = level([node("Parent", { children: level([child]) })]);

    expect(itemAncestorIds(tree, "Grandchild")).toEqual(["Parent", "Child"]);
    expect(itemAncestorIds(tree, "Parent")).toEqual([]);
  });
});

describe("siblingNodesOf", () => {
  it("Returns the root level for null parent and the child level for a parent ID", () => {
    const child = node("Child", { parentItemId: "Parent" });
    const parent = node("Parent", { children: level([child]) });
    const tree = level([parent, node("Other")]);

    expect(siblingNodesOf(tree, null)).toBe(tree);
    expect(siblingNodesOf(tree, "Parent")).toEqual(level([child]));
    expect(siblingNodesOf(tree, "Missing")).toEqual(EMPTY_SIBLINGS);
  });
});

describe("flattenItemNodes", () => {
  it("Lists items depth first with their nesting depth", () => {
    const tree = level(
      [
        node("Parent", {
          children: level([
            node("Child", { parentItemId: "Parent", children: level([node("Leaf")]) }),
          ]),
        }),
      ],
      [node("Second", { isFinished: true })],
    );

    const flat = flattenItemNodes(tree).map((entry) => `${entry.depth}:${entry.node.item.id}`);

    expect(flat).toEqual(["0:Parent", "1:Child", "2:Leaf", "0:Second"]);
  });
});

describe("canIndentNode and precedingOpenSibling", () => {
  it("Rejects finished items and the first open sibling, and skips finished siblings", () => {
    const first = node("First");
    const done = node("Done", { completedAtUtc: "2026-11-12T09:00:00Z", isFinished: true });
    const third = node("Third");
    const tree = level([first, third], [done]);

    expect(canIndentNode(tree, first)).toBe(false);
    expect(canIndentNode(tree, done)).toBe(false);
    expect(canIndentNode(tree, third)).toBe(true);
    expect(precedingOpenSibling(tree, third)).toBe(first);
  });
});
