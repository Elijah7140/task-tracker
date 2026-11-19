import { describe, expect, it } from "vitest";
import {
  keepsSection,
  mapCardDrop,
  mapCardDropToGroupEnd,
  stepCard,
} from "../../src/workspace/card-drop-mapper.js";
import type { ItemNode, ItemSiblings } from "../../src/workspace/item-outline.js";
import { buildPriorityGroups } from "../../src/workspace/priority-groups.js";

const HIGH_ID = "0190A1B2-0000-7000-8000-000000000102";

function makeNode(
  id: string,
  title: string,
  sortOrder: number,
  options: {
    priorityLevelId?: string | null;
    parentItemId?: string | null;
    isFinished?: boolean;
    children?: ReadonlyArray<ItemNode>;
  } = {},
): ItemNode {
  return {
    item: {
      id,
      projectId: "0190A1B2-0000-7000-8000-000000000001",
      folderId: null,
      parentItemId: options.parentItemId ?? null,
      title,
      description: null,
      ticketNumber: null,
      itemTypeId: null,
      priorityLevelId: options.priorityLevelId ?? null,
      statusId: null,
      reopenStatusId: null,
      dueDate: null,
      dueTime: null,
      scheduledStart: null,
      scheduledEnd: null,
      completedAtUtc: options.isFinished ? "2026-11-18T12:00:00Z" : null,
      sortOrder,
      createdAtUtc: "2026-11-18T12:00:00Z",
      updatedAtUtc: "2026-11-18T12:00:00Z",
      deletedAtUtc: null,
      deletionBatchId: null,
    },
    ownUrgency: "None",
    displayedUrgency: { value: "None", sourceDescendantId: null },
    isFinished: options.isFinished ?? false,
    children: { open: options.children ?? [], finished: [] },
  };
}

/**
 * Top-level sort order: High first (0), Plain (1), High second (2).
 * Sections: "No priority" [Plain], "High" [High first, High second].
 */
function fixture() {
  const child = makeNode("CHILD", "Child", 0, { parentItemId: "PLAIN" });
  const highFirst = makeNode("HIGH-1", "High first", 0, { priorityLevelId: HIGH_ID });
  const plain = makeNode("PLAIN", "Plain", 1, { children: [child] });
  const highSecond = makeNode("HIGH-2", "High second", 2, { priorityLevelId: HIGH_ID });
  const done = makeNode("DONE", "Done", 3, { isFinished: true });
  const nodes: ItemSiblings = { open: [highFirst, plain, highSecond], finished: [done] };
  const levels = [
    {
      id: HIGH_ID,
      name: "High",
      number: null,
      label: "High",
      colorKey: null,
      isBuiltIn: true,
      isArchived: false,
      sortOrder: 0,
    },
  ];
  const groups = buildPriorityGroups(nodes.open, levels);
  return { nodes, groups };
}

describe("card-drop-mapper", () => {
  it("Dropping after a card in another section takes its priority and place", () => {
    const { nodes, groups } = fixture();

    const placement = mapCardDrop(nodes, groups, "PLAIN", "HIGH-1", "after");

    expect(placement).toMatchObject({ priorityLevelId: HIGH_ID, index: 1 });
  });

  it("Dropping before a card in its own section keeps the priority", () => {
    const { nodes, groups } = fixture();

    const placement = mapCardDrop(nodes, groups, "HIGH-2", "HIGH-1", "before");

    expect(placement).toMatchObject({ priorityLevelId: HIGH_ID, index: 0 });
  });

  it("Dropping a sub-item beside a card promotes it into that card's section", () => {
    const { nodes, groups } = fixture();

    const placement = mapCardDrop(nodes, groups, "CHILD", "HIGH-1", "before");

    expect(placement).toMatchObject({ priorityLevelId: HIGH_ID, index: 0 });
  });

  it("Treats only a top-level move inside its own section as a sibling reorder", () => {
    const { nodes, groups } = fixture();
    const [highFirst, plain] = nodes.open;
    const child = plain!.children.open[0]!;

    const withinHigh = mapCardDrop(nodes, groups, "HIGH-1", "HIGH-2", "after")!;
    const intoHigh = mapCardDrop(nodes, groups, "PLAIN", "HIGH-2", "after")!;
    const promoted = mapCardDrop(nodes, groups, "CHILD", "PLAIN", "after")!;

    expect(withinHigh).toEqual({
      priorityLevelId: HIGH_ID,
      index: 2,
      targetId: "HIGH-2",
      position: "after",
    });
    expect(keepsSection(highFirst!, withinHigh)).toBe(true);
    expect(keepsSection(plain!, intoHigh)).toBe(false);
    expect(keepsSection(child, promoted)).toBe(false);
  });

  it("Rejects into drops, self drops and finished sources", () => {
    const { nodes, groups } = fixture();

    expect(mapCardDrop(nodes, groups, "PLAIN", "HIGH-1", "into")).toBeNull();
    expect(mapCardDrop(nodes, groups, "PLAIN", "PLAIN", "after")).toBeNull();
    expect(mapCardDrop(nodes, groups, "DONE", "HIGH-1", "after")).toBeNull();
  });

  it("Steps down inside a section by swapping with the next card", () => {
    const { nodes, groups } = fixture();

    expect(stepCard(nodes, groups, "HIGH-1", 1)).toMatchObject({
      priorityLevelId: HIGH_ID,
      index: 2,
    });
  });

  it("Steps down from a section end into the start of the next section", () => {
    const { nodes, groups } = fixture();

    expect(stepCard(nodes, groups, "PLAIN", 1)).toMatchObject({
      priorityLevelId: HIGH_ID,
      index: 0,
    });
  });

  it("Steps up from a section start into the end of the previous section", () => {
    const { nodes, groups } = fixture();

    expect(stepCard(nodes, groups, "HIGH-1", -1)).toMatchObject({
      priorityLevelId: null,
      index: 1,
    });
  });

  it("Returns null when stepping past either end of the grid", () => {
    const { nodes, groups } = fixture();

    expect(stepCard(nodes, groups, "PLAIN", -1)).toBeNull();
    expect(stepCard(nodes, groups, "HIGH-2", 1)).toBeNull();
  });

  it("Steps over an archived section unless the card is already in it", () => {
    const archivedId = "0190A1B2-0000-7000-8000-000000000109";
    const plain = makeNode("PLAIN", "Plain", 0);
    const legacy = makeNode("LEGACY", "Legacy", 1, { priorityLevelId: archivedId });
    const high = makeNode("HIGH-1", "High first", 2, { priorityLevelId: HIGH_ID });
    const nodes: ItemSiblings = { open: [plain, legacy, high], finished: [] };
    const level = { name: "", number: null, colorKey: null, isBuiltIn: false };
    const levels = [
      { ...level, id: archivedId, label: "Legacy", isArchived: true, sortOrder: 0 },
      { ...level, id: HIGH_ID, label: "High", isArchived: false, sortOrder: 1 },
    ];
    const groups = buildPriorityGroups(nodes.open, levels);

    const fromPlain = stepCard(nodes, groups, "PLAIN", 1);
    const fromLegacy = stepCard(nodes, groups, "LEGACY", 1);

    expect(groups.map((group) => group.title)).toEqual(["No priority", "Legacy", "High"]);
    expect(fromPlain).toMatchObject({ priorityLevelId: HIGH_ID, index: 1 });
    expect(fromLegacy).toMatchObject({ priorityLevelId: HIGH_ID, index: 1 });
  });

  it("Header drop appends after the section's last other card and ignores single-card self-drop", () => {
    const { nodes, groups } = fixture();
    const noPriority = groups[0]!;
    const high = groups[1]!;

    expect(mapCardDropToGroupEnd(nodes, groups, "PLAIN", high)).toMatchObject({
      priorityLevelId: HIGH_ID,
      index: 2,
    });
    expect(mapCardDropToGroupEnd(nodes, groups, "PLAIN", noPriority)).toBeNull();
  });
});
