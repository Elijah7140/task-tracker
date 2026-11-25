import { describe, expect, it } from "@effect/vitest";
import {
  editItem,
  MetadataRuleError,
  RecurrenceWeekday,
  recurrenceRule,
  skipOccurrence,
  stopRepeating,
  type ItemEdit,
  type TodoItem,
} from "../../../src/index.js";
import { item, now } from "../../fixtures.js";

const due = Temporal.PlainDate.from("2026-11-13");
const weekly = recurrenceRule("Weekly", { weekdays: RecurrenceWeekday.Friday });

function edit(source: TodoItem, overrides: Partial<ItemEdit> = {}): ItemEdit {
  return {
    title: source.title,
    description: source.description,
    ticketNumber: source.ticketNumber,
    priorityLevelId: source.priorityLevelId,
    dueDate: source.dueDate,
    dueTime: source.dueTime,
    ...overrides,
  };
}

describe("editing a recurrence rule", () => {
  it("Sets a rule and starts a series", () => {
    const task = item("task", { dueDate: due });

    const edited = editItem(task, edit(task, { recurrence: weekly }), now, () => "series");

    expect(edited).toMatchObject({ recurrence: weekly, recurrenceSeriesId: "series" });
  });

  it("Keeps the series when the rule changes and leaves the rule alone when omitted", () => {
    const task = item("task", { dueDate: due, recurrence: weekly, recurrenceSeriesId: "series" });
    const daily = recurrenceRule("Daily");

    const changed = editItem(task, edit(task, { recurrence: daily }), now, () => "other");
    const untouched = editItem(task, edit(task, { title: "Renamed" }), now);

    expect(changed).toMatchObject({ recurrence: daily, recurrenceSeriesId: "series" });
    expect(untouched).toMatchObject({ recurrence: weekly, recurrenceSeriesId: "series" });
  });

  it("Removing the rule clears the series", () => {
    const task = item("task", { dueDate: due, recurrence: weekly, recurrenceSeriesId: "series" });

    const edited = editItem(task, edit(task, { recurrence: null }), now);

    expect(edited).toMatchObject({ recurrence: null, recurrenceSeriesId: null });
  });

  it.each([
    ["a new rule", { recurrence: weekly }],
    ["the stored rule after clearing the dates", { dueDate: null }],
  ])("Refuses %s without a due date", (_name, overrides) => {
    const task = item("task", { dueDate: due, recurrence: weekly, recurrenceSeriesId: "series" });
    const draft = edit(task, { dueDate: null, ...overrides });

    const save = () => editItem(task, draft, now, () => "series");

    expect(save).toThrow("A repeating item needs a due date.");
  });

  it("Refuses an invalid rule with its message", () => {
    const task = item("task", { dueDate: due });

    const save = () => editItem(task, edit(task, { recurrence: recurrenceRule("Weekly") }), now);

    expect(save).toThrow("Choose at least one valid weekday for weekly repeats only.");
  });
});

describe("skipping an occurrence", () => {
  it("Moves the due date to the next occurrence and consumes one count", () => {
    const rule = { ...weekly, endKind: "AfterCount" as const, remaining: 2 };
    const task = item("task", {
      dueDate: due,
      dueTime: Temporal.PlainTime.from("09:15"),
      recurrence: rule,
      recurrenceSeriesId: "series",
    });

    const skipped = skipOccurrence(task, due, now);

    expect(skipped?.dueDate?.toString()).toBe("2026-11-20");
    expect(skipped?.dueTime?.toString()).toBe("09:15:00");
    expect(skipped).toMatchObject({ recurrence: { remaining: 1 }, recurrenceSeriesId: "series" });
    expect(skipOccurrence(skipped!, due, now)).toBeNull();
  });

  it("Uses today's date for a completion-date anchor", () => {
    const rule = recurrenceRule("Daily", { anchor: "CompletionDate" });
    const task = item("task", { dueDate: due, recurrence: rule, recurrenceSeriesId: "series" });

    const skipped = skipOccurrence(task, Temporal.PlainDate.from("2026-11-20"), now);

    expect(skipped?.dueDate?.toString()).toBe("2026-11-21");
  });

  it.each([
    ["a completed occurrence", { completedAtUtc: now }],
    ["an item without a rule", { recurrence: null }],
  ])("Refuses %s", (_name, overrides) => {
    const task = item("task", { dueDate: due, recurrence: weekly, ...overrides });

    const skip = () => skipOccurrence(task, due, now);

    expect(skip).toThrow(new MetadataRuleError("Only an open repeating item can be skipped."));
  });
});

describe("stopping a repeat", () => {
  it("Removes only this occurrence's rule and series", () => {
    const task = item("task", { dueDate: due, recurrence: weekly, recurrenceSeriesId: "series" });

    const stopped = stopRepeating(task, now);

    expect(stopped).toMatchObject({ recurrence: null, recurrenceSeriesId: null, dueDate: due });
  });
});
