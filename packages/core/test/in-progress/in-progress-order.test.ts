import { expect, it } from "@effect/vitest";
import { compareInProgress, type InProgressSortKey } from "../../src/index.js";

const compareTitles = (left: string, right: string) => left.localeCompare(right);

function key(title: string, overrides: Partial<InProgressSortKey> = {}): InProgressSortKey {
  return { title, urgency: "None", priorityRank: null, deadline: null, ...overrides };
}

function order(keys: readonly InProgressSortKey[]): string[] {
  return keys
    .toSorted((left, right) => compareInProgress(left, right, compareTitles))
    .map((k) => k.title);
}

it("Puts the most urgent items first", () => {
  const keys = [
    key("none"),
    key("approaching", { urgency: "Approaching" }),
    key("overdue", { urgency: "Overdue" }),
    key("imminent", { urgency: "Imminent" }),
  ];

  const titles = order(keys);

  expect(titles).toEqual(["overdue", "imminent", "approaching", "none"]);
});

it("Orders equally urgent items by priority rank with unprioritised items last", () => {
  const keys = [
    key("no priority"),
    key("low", { priorityRank: 2 }),
    key("high", { priorityRank: 0 }),
  ];

  const titles = order(keys);

  expect(titles).toEqual(["high", "low", "no priority"]);
});

it("Breaks priority ties by earliest deadline and then by title", () => {
  const soon = Temporal.Instant.from("2026-11-21T10:00:00Z");
  const later = Temporal.Instant.from("2026-11-25T10:00:00Z");
  const keys = [
    key("b undated", { priorityRank: 1 }),
    key("later", { priorityRank: 1, deadline: later }),
    key("a undated", { priorityRank: 1 }),
    key("soon", { priorityRank: 1, deadline: soon }),
  ];

  const titles = order(keys);

  expect(titles).toEqual(["soon", "later", "a undated", "b undated"]);
});
