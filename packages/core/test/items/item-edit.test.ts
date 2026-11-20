import { describe, expect, it } from "@effect/vitest";
import { editItem, MetadataRuleError, type ItemEdit, type TodoItem } from "../../src/index.js";
import { item, now } from "../fixtures.js";

function edit(source: TodoItem, overrides: Partial<ItemEdit>): ItemEdit {
  return {
    title: source.title,
    description: source.description,
    ticketNumber: source.ticketNumber,
    itemTypeId: source.itemTypeId,
    priorityLevelId: source.priorityLevelId,
    dueDate: source.dueDate,
    dueTime: source.dueTime,
    scheduledStart: source.scheduledStart,
    scheduledEnd: source.scheduledEnd,
    ...overrides,
  };
}

describe("editItem", () => {
  it("Trims the title like .NET, keeping a byte-order mark", () => {
    const task = item("A");

    const edited = editItem(task, edit(task, { title: "\u00a0\ufeffRenamed\u2028" }), now);

    expect(edited.title).toBe("\ufeffRenamed");
  });

  it("Trims the ticket number like .NET and clears a blank one", () => {
    const task = item("A");

    const trimmed = editItem(task, edit(task, { ticketNumber: "\u3000\u200bT-1\u0085" }), now);
    const blank = editItem(task, edit(task, { ticketNumber: "\u00a0\u2028" }), now);

    expect(trimmed.ticketNumber).toBe("\u200bT-1");
    expect(blank.ticketNumber).toBeNull();
  });

  it("Measures the ticket number's length after trimming", () => {
    const task = item("A");
    const fits = ` ${"1".repeat(100)}\u00a0`;

    const edited = editItem(task, edit(task, { ticketNumber: fits }), now);

    expect(edited.ticketNumber).toBe("1".repeat(100));
    expect(() => editItem(task, edit(task, { ticketNumber: "1".repeat(101) }), now)).toThrow(
      MetadataRuleError,
    );
  });
});

it("refuses to clear a ticket's number", () => {
  const ticket = item("ticket", { kind: "Ticket", ticketNumber: "385405" });

  const attempt = () => editItem(ticket, edit(ticket, { ticketNumber: "  " }), now);

  expect(attempt).toThrow("A ticket needs a ticket number.");
});
