import { describe, expect, it } from "vitest";
import { itemPushBackState, pushBackReason } from "../../src/workspace/push-back-availability.js";

describe("pushBackReason", () => {
  it.each([
    [false, true, null],
    [false, false, "This item has no due date."],
    [true, true, "Completed items cannot be pushed back."],
    [true, false, "Completed items cannot be pushed back."],
  ])(
    "Completed %s with dates %s explains why the row cannot move",
    (isCompleted, hasDates, reason) => {
      const result = pushBackReason({ isCompleted, hasDates });

      expect(result).toBe(reason);
    },
  );
});

describe("itemPushBackState", () => {
  it.each([
    [{ completedAtUtc: null, dueDate: "2026-11-10" }, false, true],
    [{ completedAtUtc: null, dueDate: null }, false, false],
    [{ completedAtUtc: "2026-11-15T10:00:00Z", dueDate: null }, true, false],
  ])("Reads %o as completed %s with dates %s", (item, isCompleted, hasDates) => {
    const state = itemPushBackState(item);

    expect(state).toEqual({ isCompleted, hasDates });
  });
});
