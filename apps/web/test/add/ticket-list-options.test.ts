import { describe, expect, it } from "vitest";
import { entryOptions, moduleOptions, parentOf } from "../../src/add/ticket-list-options.js";

const entry = (
  id: string,
  listKind: "Person" | "TicketType" | "Application" | "Module" | "Interface",
  name: string,
  parentId: string | null = null,
  sortOrder = 0,
  isArchived = false,
) => ({ id, listKind, name, parentId, sortOrder, isArchived });

const entries = [
  entry("app-b", "Application", "Payroll", null, 1),
  entry("app-a", "Application", "ClockTower", null, 0),
  entry("pay", "Module", "Pay", "app-b"),
  entry("train", "Module", "Train", "app-a"),
  entry("wayne", "Person", "Wayne", null, 0),
  entry("old", "Person", "Old Hand", null, 1, true),
];

describe("entryOptions", () => {
  it("Leaves out archived entries unless one is already chosen", () => {
    const fresh = entryOptions(entries, "Person", "");
    const kept = entryOptions(entries, "Person", "old");

    expect(fresh.map((option) => option.label)).toEqual(["None", "Wayne"]);
    expect(kept.map((option) => option.label)).toEqual(["None", "Wayne", "Old Hand (archived)"]);
  });
});

describe("moduleOptions", () => {
  it("Names each module with its application when no application is chosen", () => {
    const options = moduleOptions(entries, "", "");

    expect(options.map((option) => option.label)).toEqual([
      "None",
      "ClockTower › Train",
      "Payroll › Pay",
    ]);
  });

  it("Lists only the chosen application's modules", () => {
    const options = moduleOptions(entries, "", "app-b");

    expect(options.map((option) => option.label)).toEqual(["None", "Pay"]);
  });
});

describe("parentOf", () => {
  it("Returns the parent entry or an empty string", () => {
    expect(parentOf(entries, "train")).toBe("app-a");
    expect(parentOf(entries, "app-a")).toBe("");
    expect(parentOf(entries, "missing")).toBe("");
  });
});
