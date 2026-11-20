import { expect, it } from "@effect/vitest";
import {
  archiveTicketListEntry,
  createTicketListEntry,
  emptyTicketDetail,
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

it("trims the version and checks hours and percent complete", () => {
  const saved = validateTicketDetail(
    "ticket",
    input({ version: "  1.0.0 ", estimatedHours: 16, percentComplete: 50 }),
    lists(),
    null,
  );

  expect(saved).toMatchObject({ version: "1.0.0", estimatedHours: 16, percentComplete: 50 });
  expect(() =>
    validateTicketDetail("ticket", input({ estimatedHours: -1 }), lists(), null),
  ).toThrow("Estimated hours must be from 0 to 100000.");
  expect(() =>
    validateTicketDetail("ticket", input({ percentComplete: 50.5 }), lists(), null),
  ).toThrow("Percent complete must be a whole number from 0 to 100.");
});

it("stores a blank version as no version", () => {
  const saved = validateTicketDetail("ticket", input({ version: "   " }), lists(), null);

  expect(saved.version).toBeNull();
});
