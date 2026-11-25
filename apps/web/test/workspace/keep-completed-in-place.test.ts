import { describe, expect, it } from "vitest";
import { EMPTY_SIBLINGS, type ItemNode, type ItemSiblings } from "../../src/workspace/item-outline.js";
import { keepCompletedInPlace } from "../../src/workspace/keep-completed-in-place.js";

const DONE_AT = "2026-11-12T09:00:00Z";

const level = (
  open: ReadonlyArray<ItemNode>,
  finished: ReadonlyArray<ItemNode> = [],
): ItemSiblings => ({ open, finished });

const node = (
  title: string,
  sortOrder: number,
  options: { finished?: boolean; kind?: "Todo" | "Ticket"; children?: ItemSiblings } = {},
): ItemNode => ({
  item: {
    id: title,
    projectId: "P",
    folderId: null,
    parentItemId: null,
    kind: options.kind ?? "Todo",
    title,
    description: null,
    notes: null,
    ticketNumber: options.kind === "Ticket" ? "T-1" : null,
    itemTypeId: null,
    priorityLevelId: null,
    dueDate: null,
    dueTime: null,
    sortOrder,
    createdAtUtc: "2026-11-13T12:00:00Z",
    updatedAtUtc: "2026-11-13T12:00:00Z",
    statusId: null,
    reopenStatusId: null,
    completedAtUtc: options.finished === true ? DONE_AT : null,
    deletedAtUtc: null,
    deletionBatchId: null,
  },
  ownUrgency: "None",
  displayedUrgency: { value: "None", sourceDescendantId: null },
  isFinished: options.finished ?? false,
  children: options.children ?? EMPTY_SIBLINGS,
});

const titles = (nodes: ReadonlyArray<ItemNode>) => nodes.map((entry) => entry.item.title);

describe("keepCompletedInPlace", () => {
  it("Returns a held finished ToDo to its sibling position in the open list, still completed", () => {
    const siblings = level(
      [node("First", 0), node("Last", 2)],
      [node("Middle", 1, { finished: true }), node("Older", 3, { finished: true })],
    );

    const kept = keepCompletedInPlace(siblings, new Set(["Middle"]));

    expect(titles(kept.open)).toEqual(["First", "Middle", "Last"]);
    expect(titles(kept.finished)).toEqual(["Older"]);
    expect(kept.open[1]).toMatchObject({ isFinished: false, item: { completedAtUtc: DONE_AT } });
  });

  it("Keeps a held sub-item in its parent's open sub-items", () => {
    const children = level([node("Open child", 0)], [node("Done child", 1, { finished: true })]);
    const siblings = level([node("Parent", 0, { children })]);

    const kept = keepCompletedInPlace(siblings, new Set(["Done child"]));

    expect(titles(kept.open[0]!.children.open)).toEqual(["Open child", "Done child"]);
    expect(kept.open[0]!.children.finished).toEqual([]);
  });

  it("Never holds a completed ticket", () => {
    const siblings = level([node("Open", 0)], [node("Ticket", 1, { finished: true, kind: "Ticket" })]);

    const kept = keepCompletedInPlace(siblings, new Set(["Ticket"]));

    expect(titles(kept.open)).toEqual(["Open"]);
    expect(titles(kept.finished)).toEqual(["Ticket"]);
  });

  it("Returns the same level when nothing is held", () => {
    const siblings = level([node("Open", 0)], [node("Done", 1, { finished: true })]);

    expect(keepCompletedInPlace(siblings, new Set())).toBe(siblings);
  });
});
