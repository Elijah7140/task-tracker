import { describe, expect, it } from "vitest";
import { findItemTitle, type ItemNode, splitFinished } from "../../src/workspace/item-outline.js";

const node = (
  title: string,
  options: { completedAtUtc?: string; isFinished?: boolean; children?: Array<ItemNode> } = {},
): ItemNode => ({
  item: {
    id: title,
    projectId: "P",
    folderId: null,
    parentItemId: null,
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
