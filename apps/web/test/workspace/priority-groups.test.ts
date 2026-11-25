import type { PriorityLevelProjection } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import type { ItemNode } from "../../src/workspace/item-outline.js";
import { buildPriorityGroups, NO_PRIORITY_TITLE } from "../../src/workspace/priority-groups.js";
import { statusRankOf } from "../../src/workspace/status-rank.js";

const unranked = statusRankOf([]);

type Priority = typeof PriorityLevelProjection.Type;

function level(
  id: string,
  name: string,
  sortOrder: number,
  options: { number?: number | null; isArchived?: boolean } = {},
): Priority {
  const number = options.number ?? null;
  const label = number === null ? name : name === "" ? String(number) : `${number} · ${name}`;
  return {
    id,
    name,
    number,
    label,
    colorKey: null,
    isBuiltIn: false,
    isArchived: options.isArchived ?? false,
    sortOrder,
  };
}

function itemNode(
  id: string,
  title: string,
  options: {
    priorityLevelId?: string | null;
    sortOrder?: number;
    statusId?: string | null;
    children?: ReadonlyArray<ItemNode>;
  } = {},
): ItemNode {
  return {
    item: {
      id,
      projectId: "0190A1B2-0000-7000-8000-000000000001",
      folderId: null,
      parentItemId: null,
      title,
      description: null,
      notes: null,
      ticketNumber: null,
      priorityLevelId: options.priorityLevelId ?? null,
      statusId: options.statusId ?? null,
      reopenStatusId: null,
      dueDate: null,
      dueTime: null,
      completedAtUtc: null,
      sortOrder: options.sortOrder ?? 0,
      createdAtUtc: "2026-11-18T12:00:00Z",
      updatedAtUtc: "2026-11-18T12:00:00Z",
      deletedAtUtc: null,
      deletionBatchId: null,
    },
    ownUrgency: "None",
    displayedUrgency: { value: "None", sourceDescendantId: null },
    isFinished: false,
    showsDetailOnCard: false,
    children: { open: options.children ?? [], finished: [] },
  };
}

describe("buildPriorityGroups", () => {
  it("Places No priority first, then levels in sort order, omitting empty levels", () => {
    const critical = level("CRIT", "Critical", 0);
    const high = level("HIGH", "High", 1);
    const low = level("LOW", "Low", 2);
    const open = [
      itemNode("1", "Low task", { priorityLevelId: "LOW", sortOrder: 0 }),
      itemNode("2", "Plain", { priorityLevelId: null, sortOrder: 1 }),
      itemNode("3", "Critical task", { priorityLevelId: "CRIT", sortOrder: 2 }),
    ];

    const groups = buildPriorityGroups(open, [low, critical, high], unranked);

    expect(groups.map((group) => group.title)).toEqual([NO_PRIORITY_TITLE, "Critical", "Low"]);
    expect(groups.map((group) => group.priorityLevelId)).toEqual([null, "CRIT", "LOW"]);
    expect(groups.map((group) => group.cards.map((card) => card.item.id))).toEqual([
      ["2"],
      ["3"],
      ["1"],
    ]);
  });

  it("Follows level sort order rather than level number (1, 7, 2)", () => {
    const one = level("P1", "", 0, { number: 1 });
    const seven = level("P7", "", 1, { number: 7 });
    const two = level("P2", "", 2, { number: 2 });
    const open = [
      itemNode("A", "Two", { priorityLevelId: "P2", sortOrder: 0 }),
      itemNode("B", "Seven", { priorityLevelId: "P7", sortOrder: 1 }),
      itemNode("C", "One", { priorityLevelId: "P1", sortOrder: 2 }),
    ];

    const groups = buildPriorityGroups(open, [two, one, seven], unranked);

    expect(groups.map((group) => group.title)).toEqual(["1", "7", "2"]);
  });

  it("Shows archived priority levels while open items use them and hides empty archived levels", () => {
    const active = level("ACT", "High", 0);
    const archivedUsed = level("ARC1", "Legacy", 1, { isArchived: true });
    const archivedEmpty = level("ARC2", "Old", 2, { isArchived: true });
    const open = [
      itemNode("1", "Active task", { priorityLevelId: "ACT" }),
      itemNode("2", "Archived task", { priorityLevelId: "ARC1" }),
    ];

    const groups = buildPriorityGroups(open, [active, archivedUsed, archivedEmpty], unranked);

    expect(groups.map((group) => ({ title: group.title, isArchived: group.isArchived }))).toEqual([
      { title: "High", isArchived: false },
      { title: "Legacy", isArchived: true },
    ]);
  });

  it("Counts only top-level cards and keeps sub-items inside their parent card", () => {
    const child = itemNode("C1", "Child");
    const parent = itemNode("P1", "Parent", { children: [child] });
    const sibling = itemNode("P2", "Sibling");

    const single = buildPriorityGroups([parent], [], unranked);
    const multiple = buildPriorityGroups([parent, sibling], [], unranked);

    expect(single[0]?.countLabel).toBe("1 item");
    expect(single[0]?.cards[0]?.children.open.map((row) => row.item.id)).toEqual(["C1"]);
    expect(multiple[0]?.countLabel).toBe("2 items");
  });

  it("Orders cards inside a section by status list position, with no status last", () => {
    const statuses = [
      { id: "IP", name: "In progress", sortOrder: 1 },
      { id: "TEST", name: "Testing", sortOrder: 7 },
      { id: "QUEUED", name: "Queued", sortOrder: 2 },
    ].map((status) => ({
      ...status,
      kind: "Open" as const,
      isArchived: false,
      isInProgress: false,
    }));
    const open = [
      itemNode("1", "Bare", { sortOrder: 0 }),
      itemNode("2", "Testing", { sortOrder: 1, statusId: "TEST" }),
      itemNode("3", "First in progress", { sortOrder: 2, statusId: "IP" }),
      itemNode("4", "Queued", { sortOrder: 3, statusId: "QUEUED" }),
      itemNode("5", "Second in progress", { sortOrder: 4, statusId: "IP" }),
      itemNode("6", "Unknown status", { sortOrder: 5, statusId: "GONE" }),
    ];

    const [group] = buildPriorityGroups(open, [], statusRankOf(statuses));

    expect(group!.cards.map((card) => card.item.title)).toEqual([
      "First in progress",
      "Second in progress",
      "Queued",
      "Testing",
      "Bare",
      "Unknown status",
    ]);
  });
});
