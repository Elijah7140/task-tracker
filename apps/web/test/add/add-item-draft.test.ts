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

  it("Parses ticket hours and percent and refuses text that is not a number", () => {
    const parsed = buildAddPayload(
      "Ticket",
      draft({ ticketNumber: "1", title: "T", estimatedHours: " 16 ", percentComplete: "50" }),
    );
    const bad = buildAddPayload(
      "Ticket",
      draft({ ticketNumber: "1", title: "T", estimatedHours: "lots" }),
    );

    expect(parsed.ok && parsed.ticket).toMatchObject({ estimatedHours: 16, percentComplete: 50 });
    expect(bad).toEqual({ ok: false, message: "Est. hours must be a number." });
  });

  it("Sends no ticket fields for a ToDo and keeps its type and due time", () => {
    const result = buildAddPayload(
      "Todo",
      draft({
        title: "Meet",
        itemTypeId: "type",
        dueDate: "2026-11-27",
        dueTime: "10:00",
        moduleId: "module",
        parentItemId: "parent",
      }),
    );

    expect(result.ok && result.ticket).toBeUndefined();
    expect(result.ok && result.parentItemId).toBe("parent");
    expect(result.ok && result.fields).toMatchObject({
      itemTypeId: "type",
      dueDate: "2026-11-27",
      dueTime: "10:00:00",
    });
    expect(result.ok && result.fields).not.toHaveProperty("scheduledStart");
  });

  it("Drops the type from a ticket", () => {
    const result = buildAddPayload(
      "Ticket",
      draft({
        ticketNumber: "1",
        title: "T",
        itemTypeId: "type",
      }),
    );

    expect(result.ok && result.fields).toMatchObject({ itemTypeId: null });
    expect(result.ok && result.parentItemId).toBeNull();
  });
});
