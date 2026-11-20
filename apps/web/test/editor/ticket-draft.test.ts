import { describe, expect, it } from "vitest";
import { ticketDraftStatus } from "../../src/editor/ticket-draft.js";

const stored = {
  requestorId: null,
  applicationId: null,
  moduleId: null,
  interfaceId: null,
  dispatchedToId: "wayne",
  pendingPersonId: null,
  ticketTypeId: null,
  version: "1.0.0",
  estimatedHours: 16,
  percentComplete: 50,
  isUrgent: false,
  isSystemOutage: false,
};

describe("ticketDraftStatus", () => {
  it("Is not dirty until a value really changes", () => {
    const untouched = ticketDraftStatus(stored, {});
    const sameValue = ticketDraftStatus(stored, { version: "1.0.0" });

    expect(untouched).toEqual({ dirty: false, ticket: undefined, error: null });
    expect(sameValue.dirty).toBe(false);
  });

  it("Sends the whole replacement when one field changes", () => {
    const status = ticketDraftStatus(stored, { version: " 1.1.0 ", isUrgent: true });

    expect(status).toEqual({
      dirty: true,
      ticket: { ...stored, version: "1.1.0", isUrgent: true },
      error: null,
    });
  });

  it("Refuses a percent that is not a number and sends nothing", () => {
    const status = ticketDraftStatus(stored, { percentComplete: "half" });

    expect(status).toEqual({
      dirty: true,
      ticket: undefined,
      error: "% complete must be a number.",
    });
  });

  it("Is not dirty while the stored fields load", () => {
    const status = ticketDraftStatus(null, { version: "2.0" });

    expect(status).toEqual({ dirty: false, ticket: undefined, error: null });
  });
});
