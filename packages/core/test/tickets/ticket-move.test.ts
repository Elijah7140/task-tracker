import { describe, expect, it } from "@effect/vitest";
import {
  MetadataRuleError,
  planTicketMove,
  type PriorityLevel,
  type RankedTicket,
} from "../../src/index.js";
import { earlier } from "../fixtures.js";

const levels: ReadonlyArray<PriorityLevel> = [
  {
    id: "P",
    name: "Hotfix",
    number: 7,
    colorKey: null,
    isBuiltIn: false,
    isArchived: false,
    sortOrder: 0,
  },
  {
    id: "OLD",
    name: "Old",
    number: null,
    colorKey: null,
    isBuiltIn: false,
    isArchived: true,
    sortOrder: 1,
  },
];

const ticket = (id: string, priorityLevelId: string | null, ticketRank: number | null) =>
  ({ id, priorityLevelId, ticketRank, createdAtUtc: earlier }) satisfies RankedTicket;

const board = [
  ticket("FIRST", null, 0),
  ticket("SECOND", "P", 0),
  ticket("THIRD", "P", 1),
  ticket("STUCK", "OLD", 0),
];

const at = (priorityLevelId: string | null, anchorId: string | null = null, after = false) => ({
  priorityLevelId,
  anchorId,
  after,
});

describe("planning a ticket move", () => {
  it("Moves after the last ticket of another section and ranks that section consecutively", () => {
    const plan = planTicketMove(board, levels, "FIRST", at("P", "THIRD", true));

    expect(plan).toEqual({
      priorityLevelId: "P",
      priorityChanged: true,
      ranks: [
        { id: "SECOND", rank: 0 },
        { id: "THIRD", rank: 1 },
        { id: "FIRST", rank: 2 },
      ],
    });
  });

  it("Moves to the start of a section without an anchor and clears the priority in no priority", () => {
    const plan = planTicketMove(board, levels, "THIRD", at(null));

    expect(plan).toEqual({
      priorityLevelId: null,
      priorityChanged: true,
      ranks: [
        { id: "THIRD", rank: 0 },
        { id: "FIRST", rank: 1 },
      ],
    });
  });

  it("Does nothing when the ticket would land where it is", () => {
    const plans = [
      planTicketMove(board, levels, "SECOND", at("P", "THIRD")),
      planTicketMove(board, levels, "SECOND", at("P")),
      planTicketMove(board, levels, "SECOND", at("P", "SECOND", true)),
    ];

    expect(plans).toEqual([null, null, null]);
  });

  it("Appends after every ticket of the new section when setting a priority", () => {
    const plan = planTicketMove(board, levels, "FIRST", at("P"), { append: true });
    const unchanged = planTicketMove(board, levels, "THIRD", at("P"), { append: true });

    expect(plan?.ranks.map(({ id }) => id)).toEqual(["SECOND", "THIRD", "FIRST"]);
    expect(unchanged).toBeNull();
  });

  it("Lets a ticket move within or out of an archived level but never into it", () => {
    const within = planTicketMove([...board, ticket("MORE", "OLD", 1)], levels, "MORE", at("OLD"));
    const out = planTicketMove(board, levels, "STUCK", at(null));

    expect(within?.priorityChanged).toBe(false);
    expect(out?.priorityLevelId).toBeNull();
    expect(() => planTicketMove(board, levels, "FIRST", at("OLD"))).toThrow(
      new MetadataRuleError("Choose an active priority level."),
    );
  });

  it("Refuses an item that is no longer a ticket and an anchor that moved away", () => {
    expect(() => planTicketMove(board, levels, "GONE", at(null))).toThrow(
      new MetadataRuleError("This item is no longer an open ticket."),
    );
    expect(() => planTicketMove(board, levels, "FIRST", at("P", "STUCK"))).toThrow(
      new MetadataRuleError("The target ticket has moved or is no longer open."),
    );
  });
});
