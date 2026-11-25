import { expect, it } from "@effect/vitest";
import {
  archiveTicketListEntry,
  createTicketListEntry,
  emptyTicketDetail,
  showsDetailOnCard,
  type TicketDetailInput,
  type TicketListEntry,
  validateTicketDetail,
} from "../../src/index.js";

function lists(): TicketListEntry[] {
  const app = createTicketListEntry("app", "Application", null, "ClockTower", []);
  const otherApp = createTicketListEntry("other", "Application", null, "Payroll", [app]);
  const module = createTicketListEntry("train", "Module", "app", "Train", [app, otherApp]);
  const otherModule = createTicketListEntry("pay", "Module", "other", "Pay", [app, otherApp]);
  const iface = createTicketListEntry("conv", "Interface", "train", "Conversion", [app, module]);
  const person = createTicketListEntry("melissa", "Person", null, "Melissa", []);
  const type = createTicketListEntry("d", "TicketType", null, "D", []);
  return [app, otherApp, module, otherModule, iface, person, type];
}

function input(overrides: Partial<TicketDetailInput> = {}): TicketDetailInput {
  const { itemId: _itemId, ...empty } = emptyTicketDetail("ticket");
  return { ...empty, ...overrides };
}

it("fills in the module and application implied by an interface", () => {
  const saved = validateTicketDetail("ticket", input({ interfaceId: "conv" }), lists(), null);

  expect(saved).toMatchObject({ itemId: "ticket", moduleId: "train", applicationId: "app" });
});

it("refuses a module that belongs to another application", () => {
  const detail = input({ applicationId: "other", moduleId: "train" });

  const attempt = () => validateTicketDetail("ticket", detail, lists(), null);

  expect(attempt).toThrow("Train is not a module of the chosen application.");
});

it("refuses an entry from the wrong list", () => {
  const attempt = () => validateTicketDetail("ticket", input({ requestorId: "d" }), lists(), null);

  expect(attempt).toThrow("Requestor must be a person from the list.");
});

it("keeps an archived entry already on the ticket but refuses to newly choose one", () => {
  const rows = lists().map((row) => (row.id === "melissa" ? archiveTicketListEntry(row) : row));
  const previous = { ...emptyTicketDetail("ticket"), requestorId: "melissa" };

  const kept = validateTicketDetail("ticket", input({ requestorId: "melissa" }), rows, previous);
  const attempt = () =>
    validateTicketDetail("ticket", input({ dispatchedToId: "melissa" }), rows, previous);

  expect(kept.requestorId).toBe("melissa");
  expect(attempt).toThrow("Dispatched to 'Melissa' is archived.");
});

it("trims a parent ticket number and stores a blank one as none", () => {
  const typed = validateTicketDetail("ticket", input({ parentTicketNumber: " 385405 " }), [], null);
  const blank = validateTicketDetail("ticket", input({ parentTicketNumber: "\u00a0" }), [], null);

  expect(typed.parentTicketNumber).toBe("385405");
  expect(blank.parentTicketNumber).toBeNull();
});

it("refuses a parent ticket number longer than a ticket number", () => {
  const detail = input({ parentTicketNumber: "1".repeat(101) });

  const attempt = () => validateTicketDetail("ticket", detail, [], null);

  expect(attempt).toThrow("Parent ticket must be at most 100 characters.");
});

it("keeps the card's Detail choice through a save of the other fields", () => {
  const previous = { ...emptyTicketDetail("ticket"), showDetailOnCard: false };

  const saved = validateTicketDetail(
    "ticket",
    input({ requestorId: "melissa" }),
    lists(),
    previous,
  );

  expect(saved.showDetailOnCard).toBe(false);
});

it("shows the Detail by the ticket's own choice, else by the global setting", () => {
  const hidden = { showDetailOnCard: false };
  const shown = { showDetailOnCard: true };
  const following = { showDetailOnCard: null };

  expect(showsDetailOnCard(hidden, true)).toBe(false);
  expect(showsDetailOnCard(shown, false)).toBe(true);
  expect(showsDetailOnCard(following, true)).toBe(true);
  expect(showsDetailOnCard(null, false)).toBe(false);
});
