import { describe, expect, it } from "vitest";
import { buildAddPayload, emptyAddDraft } from "../../src/add/add-item-draft.js";

const draft = (overrides: Partial<ReturnType<typeof emptyAddDraft>> = {}) => ({
  ...emptyAddDraft(null),
  ...overrides,
});

describe("buildAddPayload", () => {
  it("Refuses a ticket without a number before checking its summary", () => {
    const result = buildAddPayload("Ticket", draft({ title: "" }));

    expect(result).toEqual({ ok: false, message: "A ticket needs a ticket number." });
  });

  it("Names the missing main line by kind", () => {
    const ticket = buildAddPayload("Ticket", draft({ ticketNumber: "385405", title: " " }));
    const todo = buildAddPayload("Todo", draft({ title: "" }));

    expect(ticket).toEqual({ ok: false, message: "Enter a summary." });
    expect(todo).toEqual({ ok: false, message: "Enter a description." });
  });

  it("Adds seconds to the due time and drops it without a due date", () => {
    const dated = buildAddPayload(
      "Todo",
      draft({ title: "Call", dueDate: "2026-11-27", dueTime: "09:30" }),
    );
    const undated = buildAddPayload("Todo", draft({ title: "Call", dueTime: "09:30" }));

    expect(dated.ok && dated.fields).toMatchObject({ dueDate: "2026-11-27", dueTime: "09:30:00" });
    expect(undated.ok && undated.fields).toMatchObject({ dueDate: null, dueTime: null });
  });

  it("Sends a ticket's Detail and notes and only the notes of a ToDo", () => {
    const texts = { description: "Detail text", notes: "Notes text" };
    const ticket = buildAddPayload("Ticket", draft({ ticketNumber: "1", title: "T", ...texts }));
    const todo = buildAddPayload("Todo", draft({ title: "T", ...texts }));

    expect(ticket.ok && ticket.fields).toMatchObject({
      description: "Detail text",
      notes: "Notes text",
    });
    expect(todo.ok && todo.fields).toMatchObject({ description: null, notes: "Notes text" });
  });

  it("Maps the reminder choice to its wire form", () => {
    const choices = ["default", "none", "30"].map((reminder) => {
      const result = buildAddPayload("Todo", draft({ title: "Call", reminder }));
      return result.ok ? result.reminder : null;
    });

    expect(choices).toEqual([
      { kind: "default" },
      { kind: "none" },
      { kind: "offset", minutes: 30 },
    ]);
  });

  it("Sends no ticket fields for a ToDo, not even a ticket number, and keeps its due time", () => {
    const result = buildAddPayload(
      "Todo",
      draft({
        title: "Meet",
        dueDate: "2026-11-27",
        dueTime: "10:00",
        moduleId: "module",
        parentItemId: "parent",
        ticketNumber: "JIRA-1",
        parentTicketNumber: "385400",
      }),
    );

    expect(result.ok && result.ticket).toBeUndefined();
    expect(result.ok && result.fields.ticketNumber).toBeNull();
    expect(result.ok && result.parentItemId).toBe("parent");
    expect(result.ok && result.fields).toMatchObject({
      dueDate: "2026-11-27",
      dueTime: "10:00:00",
    });
    expect(result.ok && result.fields).not.toHaveProperty("scheduledStart");
  });

  it("Sends a ticket's typed parent ticket number apart from its place in the tree", () => {
    const result = buildAddPayload(
      "Ticket",
      draft({
        ticketNumber: "1",
        title: "T",
        parentTicketNumber: " 385400 ",
      }),
    );
    const blank = buildAddPayload("Ticket", draft({ ticketNumber: "2", title: "U" }));

    expect(result.ok && result.ticket?.parentTicketNumber).toBe("385400");
    expect(result.ok && result.parentItemId).toBeNull();
    expect(result.ok && result.fields).not.toHaveProperty("itemTypeId");
    expect(blank.ok && blank.ticket?.parentTicketNumber).toBeNull();
  });

  it("Starts a ticket added under a ticket with that ticket's number as its parent", () => {
    const under = emptyAddDraft("PARENT-ID", "385400");
    const top = emptyAddDraft(null);

    expect(under).toMatchObject({ parentItemId: "PARENT-ID", parentTicketNumber: "385400" });
    expect(top).toMatchObject({ parentItemId: "", parentTicketNumber: "" });
  });
});
