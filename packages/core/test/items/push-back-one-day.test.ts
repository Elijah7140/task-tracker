import { describe, expect, it } from "@effect/vitest";
import {
  FloatingTime,
  MetadataRuleError,
  pushBackOneDay,
  pushBackUnavailableReason,
  RecurrenceWeekday,
  recurrenceRule,
} from "../../src/index.js";
import { earlier, item, now } from "../fixtures.js";

const date = (value: string) => Temporal.PlainDate.from(value);
const dateTime = (value: string) => Temporal.PlainDateTime.from(value);

describe("push back eligibility", () => {
  it.each([
    [false, true, null],
    [false, false, "This item has no due date or scheduled block."],
    [true, true, "Completed items cannot be pushed back."],
    [true, false, "Completed items cannot be pushed back."],
  ])(
    "Completed %s with dates %s explains why the item cannot move",
    (completed, hasDates, reason) => {
      const result = pushBackUnavailableReason({ isCompleted: completed, hasDates });

      expect(result).toBe(reason);
    },
  );
});

describe("pushing an item back one day", () => {
  it("Moves the due date and keeps its time, counting from the item's own date", () => {
    const overdue = item("task", {
      dueDate: date("2026-11-10"),
      dueTime: Temporal.PlainTime.from("15:30"),
    });

    const moved = pushBackOneDay(overdue, now);

    expect(moved.dueDate).toEqual(date("2026-11-11"));
    expect(moved.dueTime).toEqual(Temporal.PlainTime.from("15:30"));
    expect(moved.updatedAtUtc).toEqual(now);
  });

  it("Moves both ends of a scheduled block across midnight and keeps its length", () => {
    const start = dateTime("2026-11-10T23:45");
    const end = dateTime("2026-11-11T01:45");
    const block = item("task", {
      dueDate: date("2026-11-10"),
      scheduledStart: start,
      scheduledEnd: end,
    });

    const moved = pushBackOneDay(block, now);

    expect(moved.dueDate).toEqual(date("2026-11-11"));
    expect(moved.scheduledStart).toEqual(dateTime("2026-11-11T23:45"));
    expect(moved.scheduledEnd).toEqual(dateTime("2026-11-12T01:45"));
    expect(moved.scheduledStart!.until(moved.scheduledEnd!)).toEqual(start.until(end));
  });

  it("Moves a block without an end or due date", () => {
    const block = item("task", { scheduledStart: dateTime("2026-11-10T09:00") });

    const moved = pushBackOneDay(block, now);

    expect(moved).toMatchObject({ dueDate: null, scheduledEnd: null });
    expect(moved.scheduledStart).toEqual(dateTime("2026-11-11T09:00"));
  });

  it.each([
    ["2026-01-31", "2026-02-01"],
    ["2026-02-28", "2026-03-01"],
    ["2028-02-28", "2028-02-29"],
    ["2028-02-29", "2028-03-01"],
    ["2026-12-31", "2027-01-01"],
    ["9999-12-30", "9999-12-31"],
  ])("Moves a due date on %s to %s", (from, to) => {
    const moved = pushBackOneDay(item("task", { dueDate: date(from) }), now);

    expect(moved.dueDate).toEqual(date(to));
  });

  it("Keeps the floating wall-clock times when the next day starts or ends daylight saving time", () => {
    const zone = "America/New_York";
    const spring = item("spring", {
      scheduledStart: dateTime("2026-03-07T02:30"),
      scheduledEnd: dateTime("2026-03-07T03:30"),
    });
    const autumn = item("autumn", {
      dueDate: date("2026-10-31"),
      dueTime: Temporal.PlainTime.from("01:30"),
    });

    const springMoved = pushBackOneDay(spring, now);
    const autumnMoved = pushBackOneDay(autumn, now);

    expect(springMoved.scheduledStart).toEqual(dateTime("2026-03-08T02:30"));
    expect(springMoved.scheduledEnd).toEqual(dateTime("2026-03-08T03:30"));
    expect(FloatingTime.toUtc(springMoved.scheduledStart!, zone)).toEqual(
      Temporal.Instant.from("2026-03-08T07:00:00Z"),
    );
    expect(autumnMoved.dueTime).toEqual(Temporal.PlainTime.from("01:30"));
    expect(
      FloatingTime.toUtc(autumnMoved.dueDate!.toPlainDateTime(autumnMoved.dueTime!), zone),
    ).toEqual(Temporal.Instant.from("2026-11-01T05:30:00Z"));
  });

  it("Moves only this occurrence of a repeating item and keeps its rule and series", () => {
    const rule = recurrenceRule("Weekly", {
      weekdays: RecurrenceWeekday.Friday,
      endKind: "AfterCount",
      remaining: 3,
    });
    const repeating = item("task", {
      dueDate: date("2026-11-13"),
      recurrence: rule,
      recurrenceSeriesId: "series",
    });

    const moved = pushBackOneDay(repeating, now);

    expect(moved).toMatchObject({ recurrence: rule, recurrenceSeriesId: "series" });
    expect(moved.dueDate).toEqual(date("2026-11-14"));
  });

  it("Refuses completed and undated items", () => {
    const completed = item("done", { dueDate: date("2026-11-10"), completedAtUtc: earlier });
    const undated = item("undated", { dueTime: Temporal.PlainTime.from("09:00") });

    expect(() => pushBackOneDay(completed, now)).toThrow(
      new MetadataRuleError("Completed items cannot be pushed back."),
    );
    expect(() => pushBackOneDay(undated, now)).toThrow(
      new MetadataRuleError("This item has no due date or scheduled block."),
    );
  });

  it("Refuses a move past the last supported date", () => {
    const last = item("last", {
      dueDate: date("9999-12-31"),
      scheduledStart: dateTime("2026-11-10T13:00"),
    });

    expect(() => pushBackOneDay(last, now)).toThrow(
      new MetadataRuleError("Pushing back would move a date outside the supported calendar."),
    );
  });
});
