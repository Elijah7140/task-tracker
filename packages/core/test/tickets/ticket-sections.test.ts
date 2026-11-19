import { describe, expect, it } from "@effect/vitest";
import { buildTicketSections, type PriorityLevel, type RankedTicket } from "../../src/index.js";
import { earlier } from "../fixtures.js";

function level(id: string, sortOrder: number, number: number | null, isArchived = false) {
  return {
    id,
    name: id,
    number,
    colorKey: null,
    isBuiltIn: false,
    isArchived,
    sortOrder,
  } satisfies PriorityLevel;
}

const ticket = (id: string, priorityLevelId: string | null, ticketRank: number | null = null) =>
  ({ id, priorityLevelId, ticketRank, createdAtUtc: earlier }) satisfies RankedTicket;

describe("ticket sections", () => {
  it("Starts with no priority and follows level sort order, never the level numbers", () => {
    const levels = [level("Later", 2, 2), level("First", 0, 1), level("Hotfix", 1, 7)];
    const tickets = [ticket("T2", "Later"), ticket("T7", "Hotfix"), ticket("T1", "First")];

    const sections = buildTicketSections(tickets, levels);

    expect(sections.map(({ priority }) => priority?.number ?? null)).toEqual([null, 1, 7, 2]);
    expect(sections.map(({ tickets: rows }) => rows.map(({ id }) => id))).toEqual([
      [],
      ["T1"],
      ["T7"],
      ["T2"],
    ]);
  });

  it("Shows an archived level only while it holds tickets", () => {
    const levels = [level("Kept", 0, null, true), level("Empty", 1, null, true)];

    const sections = buildTicketSections([ticket("A", "Kept")], levels);

    expect(sections.map(({ priority }) => priority?.id ?? null)).toEqual([null, "Kept"]);
  });

  it("Orders each section by rank, ranked tickets first", () => {
    const tickets = [ticket("U", null), ticket("B", null, 1), ticket("A", null, 0)];

    const [noPriority] = buildTicketSections(tickets, []);

    expect(noPriority?.tickets.map(({ id }) => id)).toEqual(["A", "B", "U"]);
  });
});
