import { describe, expect, it } from "vitest";
import { ticketDraftStatus } from "../../src/editor/ticket-draft.js";

const stored = {
  requestorId: null,
  applicationId: null,
  moduleId: null,
  interfaceId: null,
  dispatchedToId: "wayne",
  pendingPersonId: null,
  ticketTypeId: "defect",
};

describe("ticketDraftStatus", () => {
  it("Is not dirty until a value really changes", () => {
    const untouched = ticketDraftStatus(stored, {});
    const sameValue = ticketDraftStatus(stored, { ticketTypeId: "defect" });

    expect(untouched).toEqual({ dirty: false, ticket: undefined });
    expect(sameValue.dirty).toBe(false);
  });

  it("Sends the whole replacement when one field changes", () => {
    const status = ticketDraftStatus(stored, { requestorId: " anna " });

    expect(status).toEqual({ dirty: true, ticket: { ...stored, requestorId: "anna" } });
  });

  it("Clears a field set back to blank", () => {
    const status = ticketDraftStatus(stored, { dispatchedToId: "" });

    expect(status).toEqual({ dirty: true, ticket: { ...stored, dispatchedToId: null } });
  });

  it("Is not dirty while the stored fields load", () => {
    const status = ticketDraftStatus(null, { requestorId: "anna" });

    expect(status).toEqual({ dirty: false, ticket: undefined });
  });
});
