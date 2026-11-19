import { describe, expect, it } from "@effect/vitest";
import { orderTickets, planTicketAppend, type RankedTicket } from "../../src/index.js";
import { earlier } from "../fixtures.js";

function ticket(
  id: string,
  priorityLevelId: string | null,
  ticketRank: number | null,
  createdSeconds = 0,
): RankedTicket {
  return {
    id,
    priorityLevelId,
    ticketRank,
    createdAtUtc: earlier.add({ seconds: createdSeconds }),
  };
}

describe("ticket order", () => {
  it("Puts ranked tickets first by rank, then unranked ones by creation time and ID", () => {
    const tickets = [
      ticket("E", null, null, 1),
      ticket("D", null, null, 1),
      ticket("C", null, null, 0),
      ticket("B", null, 1),
      ticket("A", null, 0.5),
    ];

    const ordered = orderTickets(tickets);

    expect(ordered.map(({ id }) => id)).toEqual(["A", "B", "C", "D", "E"]);
  });
});

describe("appending new tickets", () => {
  it("Ranks a new ticket after the highest rank in its section only", () => {
    const existing = [ticket("A", null, 4), ticket("B", "P", 9)];

    const ranks = planTicketAppend(existing, [ticket("N", null, null)]);

    expect(ranks).toEqual([{ id: "N", rank: 5 }]);
  });

  it("Ranks legacy unranked tickets in their current order before the new one", () => {
    const existing = [
      ticket("A", null, 0),
      ticket("U2", null, null, 2),
      ticket("U1", null, null, 1),
    ];

    const ranks = planTicketAppend(existing, [ticket("N", null, null, 0)]);

    expect(ranks).toEqual([
      { id: "U1", rank: 1 },
      { id: "U2", rank: 2 },
      { id: "N", rank: 3 },
    ]);
  });

  it("Appends a batch in the order it was added, one section at a time", () => {
    const incoming = [ticket("X", "P", null), ticket("Y", null, null), ticket("Z", "P", null)];

    const ranks = planTicketAppend([], incoming);

    expect(ranks).toEqual([
      { id: "X", rank: 0 },
      { id: "Z", rank: 1 },
      { id: "Y", rank: 0 },
    ]);
  });

  it("Ignores an incoming ticket that is also listed as existing", () => {
    const stale = ticket("N", null, 7);

    const ranks = planTicketAppend([ticket("A", null, 0), stale], [ticket("N", null, null)]);

    expect(ranks).toEqual([{ id: "N", rank: 1 }]);
  });
});
