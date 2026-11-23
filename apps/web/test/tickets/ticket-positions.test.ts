import type { TicketSection } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  acceptsTicketDrop,
  headerPosition,
  keyboardStepPosition,
  rowPosition,
} from "../../src/tickets/ticket-positions.js";

type Section = typeof TicketSection.Type;

const ticket = (itemId: string, priorityLevelId: string | null) => ({
  itemId,
  projectId: "P",
  folderId: null,
  projectName: "Project",
  ticketNumber: itemId,
  title: itemId,
  statusId: null,
  statusName: null,
  priorityLevelId,
  dueDate: null,
  dueTime: null,
});

const section = (
  priorityLevelId: string | null,
  ids: ReadonlyArray<string>,
  isArchived = false,
): Section => ({
  priorityLevelId,
  label: priorityLevelId ?? "No priority",
  isArchived,
  tickets: ids.map((id) => ticket(id, priorityLevelId)),
});

const sections = [
  section(null, ["A", "B"]),
  section("HIGH", []),
  section("OLD", ["C"], true),
  section("LOW", ["D"]),
];

describe("keyboard steps", () => {
  it("Moves past the next visible row in the same section", () => {
    expect(keyboardStepPosition(sections, "A", 1)).toEqual({
      priorityLevelId: null,
      anchorId: "B",
      after: true,
    });
    expect(keyboardStepPosition(sections, "B", -1)).toEqual({
      priorityLevelId: null,
      anchorId: "A",
      after: false,
    });
  });

  it("Enters an empty section at its header and skips archived sections", () => {
    expect(keyboardStepPosition(sections, "B", 1)).toEqual({
      priorityLevelId: "HIGH",
      anchorId: null,
      after: false,
    });
    expect(keyboardStepPosition(sections, "D", -1)).toEqual({
      priorityLevelId: "HIGH",
      anchorId: null,
      after: true,
    });
  });

  it("Enters the next section before its first row and the previous one after its last row", () => {
    const filled = [section(null, ["A", "B"]), section("HIGH", ["H1", "H2"])];

    expect(keyboardStepPosition(filled, "B", 1)).toEqual({
      priorityLevelId: "HIGH",
      anchorId: "H1",
      after: false,
    });
    expect(keyboardStepPosition(filled, "H1", -1)).toEqual({
      priorityLevelId: null,
      anchorId: "B",
      after: true,
    });
  });

  it("Lets an archived level's ticket leave it but stops at the list ends", () => {
    expect(keyboardStepPosition(sections, "C", -1)?.priorityLevelId).toBe("HIGH");
    expect(keyboardStepPosition(sections, "A", -1)).toBeNull();
    expect(keyboardStepPosition(sections, "D", 1)).toBeNull();
    expect(keyboardStepPosition(sections, "Z", 1)).toBeNull();
  });
});

describe("drop targets", () => {
  it("Places before or after a row and at the start of a section from its header", () => {
    const [noPriority, high] = sections;

    expect(rowPosition(noPriority!.tickets[1]!, true)).toEqual({
      priorityLevelId: null,
      anchorId: "B",
      after: true,
    });
    expect(headerPosition(high!)).toEqual({
      priorityLevelId: "HIGH",
      anchorId: null,
      after: false,
    });
  });

  it("Accepts drops in the ticket's own section or an active one, never on itself", () => {
    const [first] = sections[0]!.tickets;
    const stuck = sections[2]!.tickets[0]!;

    expect(acceptsTicketDrop(sections, first!, headerPosition(sections[1]!))).toBe(true);
    expect(acceptsTicketDrop(sections, first!, headerPosition(sections[2]!))).toBe(false);
    expect(acceptsTicketDrop(sections, stuck, headerPosition(sections[2]!))).toBe(true);
    expect(acceptsTicketDrop(sections, first!, rowPosition(first!, false))).toBe(false);
  });
});
