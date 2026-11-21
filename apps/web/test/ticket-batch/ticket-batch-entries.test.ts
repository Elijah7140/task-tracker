import { describe, expect, it } from "vitest";
import {
  addEntry,
  editEntry,
  emptyBatch,
  entryLabel,
  hasTyping,
  hasUnsavedTickets,
  rejectEntryAt,
  removeEntry,
  type TicketBatch,
} from "../../src/ticket-batch/ticket-batch-entries.js";

const typed = (batch: TicketBatch, ticketNumber: string, title: string): TicketBatch => ({
  ...batch,
  draft: { ...batch.draft, ticketNumber, title },
});

/** A batch with the given tickets listed, keyed "a", "b", … in order. */
function listed(...tickets: ReadonlyArray<readonly [string, string]>): TicketBatch {
  return tickets.reduce((batch, [ticketNumber, title], index) => {
    const result = addEntry(typed(batch, ticketNumber, title), String.fromCharCode(97 + index));
    if (!result.ok) {
      throw new Error(result.message);
    }
    return result.batch;
  }, emptyBatch());
}

describe("addEntry", () => {
  it("Lists the form's ticket at the end and leaves a blank form", () => {
    const batch = listed(["1", "First"]);

    const result = addEntry(typed(batch, " 2 ", "Second"), "b");

    expect(result.ok).toBe(true);
    const next = result.ok ? result.batch : batch;
    expect(next.entries.map((entry) => entry.key)).toEqual(["a", "b"]);
    expect(next.entries[1]?.ticket).toMatchObject({
      fields: { ticketNumber: " 2 ", title: "Second" },
    });
    expect(next.entries[1]?.ticket.ticket).toMatchObject({ dispatchedToId: null, isUrgent: false });
    expect(hasTyping(next.draft)).toBe(false);
  });

  it("Keeps the ticket fields a filled-in dispatcher sets", () => {
    const batch = typed(emptyBatch(), "3", "Third");

    const result = addEntry({ ...batch, draft: { ...batch.draft, dispatchedToId: "p1" } }, "c");

    expect(result.ok && result.batch.entries[0]?.ticket.ticket?.dispatchedToId).toBe("p1");
  });

  it("Refuses a ticket without a number, then one without a summary", () => {
    const noNumber = addEntry(typed(emptyBatch(), "", "Summary"), "a");
    const noSummary = addEntry(typed(emptyBatch(), "4", " "), "a");

    expect(noNumber).toEqual({ ok: false, message: "A ticket needs a ticket number." });
    expect(noSummary).toEqual({ ok: false, message: "Enter a summary." });
  });
});

describe("editing the list", () => {
  it("Edit moves a ticket back into a blank form and leaves typing alone", () => {
    const batch = listed(["1", "First"], ["2", "Second"]);

    const edited = editEntry(batch, "a");
    const refused = editEntry(typed(batch, "", "Typing"), "a");

    expect(edited.draft).toMatchObject({ ticketNumber: "1", title: "First" });
    expect(edited.entries.map((entry) => entry.key)).toEqual(["b"]);
    expect(refused.entries).toHaveLength(2);
    expect(refused.draft.title).toBe("Typing");
  });

  it("Marks the refused ticket by its index and clears the mark when it is removed", () => {
    const batch = listed(["1", "First"], ["2", "Second"]);

    const rejected = rejectEntryAt(batch, 1);
    const removed = removeEntry(rejected, "b");

    expect(rejected.rejectedKey).toBe("b");
    expect(rejectEntryAt(batch, 5).rejectedKey).toBeNull();
    expect(removed.rejectedKey).toBeNull();
    expect(removed.entries.map((entry) => entry.key)).toEqual(["a"]);
  });
});

describe("hasUnsavedTickets", () => {
  it("Counts typing in the form and listed tickets, but not an empty view", () => {
    expect(hasUnsavedTickets(emptyBatch())).toBe(false);
    expect(hasUnsavedTickets(typed(emptyBatch(), "", "Half typed"))).toBe(true);
    expect(hasUnsavedTickets(listed(["1", "First"]))).toBe(true);
  });
});

describe("entryLabel", () => {
  it("Names a ticket by its trimmed number and summary", () => {
    const [entry] = listed([" 385405 ", " Conversion data "]).entries;

    expect(entry && entryLabel(entry)).toBe("#385405 · Conversion data");
  });
});
