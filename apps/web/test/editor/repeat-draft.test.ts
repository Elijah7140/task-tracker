import type { Item } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  REPEAT_DATE_REQUIRED,
  type RepeatDraft,
  repeatDate,
  repeatDraftStatus,
  storedRepeatDraft,
} from "../../src/editor/repeat-draft.js";
import type { RepeatRule } from "../../src/format/recurrence-summary.js";

type ItemRecord = typeof Item.Type;

const ITEM: ItemRecord = {
  id: "0190A1B2-0000-7000-8000-000000000001",
  projectId: "0190A1B2-0000-7000-8000-000000000002",
  folderId: null,
  parentItemId: null,
  title: "Task",
  description: null,
  notes: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: "2026-11-19",
  dueTime: null,
  sortOrder: 0,
  createdAtUtc: "2026-11-13T12:00:00Z",
  updatedAtUtc: "2026-11-13T12:00:00Z",
  statusId: null,
  reopenStatusId: null,
  completedAtUtc: null,
  recurrence: null,
  recurrenceSeriesId: null,
  deletedAtUtc: null,
  deletionBatchId: null,
};

const WEEKLY: RepeatRule = {
  frequency: "Weekly",
  interval: 2,
  weekdays: 1 | 8,
  monthDay: null,
  month: null,
  anchor: "CompletionDate",
  endKind: "AfterCount",
  endDate: null,
  remaining: 3,
};

const draft = (item: ItemRecord, overrides: Partial<RepeatDraft>): RepeatDraft => ({
  ...storedRepeatDraft(item),
  ...overrides,
});

describe("storedRepeatDraft", () => {
  it("Seeds a new rule with the due date's weekday and day of the month", () => {
    expect(storedRepeatDraft(ITEM)).toEqual({
      frequency: "None",
      interval: "1",
      weekdays: 8,
      monthDay: "19",
      lastDay: false,
      anchor: "DueDate",
      endKind: "Never",
      endDate: "",
      count: "1",
    });
  });

  it("Shows a stored rule unchanged", () => {
    const item = { ...ITEM, recurrence: WEEKLY };

    const status = repeatDraftStatus(item, storedRepeatDraft(item), "2026-11-19");

    expect(status).toEqual({
      recurrence: undefined,
      changed: false,
      error: null,
      summary: "Every 2 weeks on Mon, Thu",
    });
  });
});

describe("repeatDraftStatus", () => {
  it("Builds each frequency's rule from the draft", () => {
    const rules = (["Daily", "Weekly", "Monthly", "Yearly"] as const).map(
      (frequency) => repeatDraftStatus(ITEM, draft(ITEM, { frequency }), "2026-11-19").recurrence,
    );

    expect(rules.map((rule) => [rule?.weekdays, rule?.monthDay, rule?.month])).toEqual([
      [null, null, null],
      [8, null, null],
      [null, 19, null],
      [null, 19, 11],
    ]);
  });

  it("Keeps a saved yearly day until the date it came from changes", () => {
    const yearly = {
      ...WEEKLY,
      frequency: "Yearly" as const,
      weekdays: null,
      month: 2,
      monthDay: 29,
    };
    const item = { ...ITEM, dueDate: "2027-02-28", recurrence: yearly };

    const same = repeatDraftStatus(item, draft(item, {}), "2027-02-28");
    const moved = repeatDraftStatus(item, draft(item, {}), "2027-03-05");

    expect(same.changed).toBe(false);
    expect(moved.recurrence).toMatchObject({ month: 3, monthDay: 5 });
  });

  it("Choosing Does not repeat removes a stored rule", () => {
    const item = { ...ITEM, recurrence: WEEKLY };

    const status = repeatDraftStatus(item, draft(item, { frequency: "None" }), "2026-11-19");

    expect(status).toEqual({ recurrence: null, changed: true, error: null, summary: null });
  });

  it.each([
    [{ frequency: "Daily", interval: "0" }, "Repeat interval must be positive."],
    [
      { frequency: "Weekly", weekdays: 0 },
      "Choose at least one valid weekday for weekly repeats only.",
    ],
    [{ frequency: "Monthly", monthDay: "32" }, "Enter a day of the month from 1 to 31."],
    [
      { frequency: "Daily", endKind: "OnDate" },
      "An end date is required only when the repeat ends on a date.",
    ],
    [
      { frequency: "Daily", endKind: "AfterCount", count: "x" },
      "A positive occurrence count is required only for a count limit.",
    ],
  ] as const)("Explains an invalid draft %j", (overrides, message) => {
    const status = repeatDraftStatus(ITEM, draft(ITEM, overrides), "2026-11-19");

    expect(status).toMatchObject({ error: message, summary: null, changed: true });
  });

  it("Requires a due date, even for an untouched stored rule", () => {
    const item = { ...ITEM, recurrence: WEEKLY };

    const touched = repeatDraftStatus(ITEM, draft(ITEM, { frequency: "Daily" }), null);
    const untouched = repeatDraftStatus(item, null, null);

    expect([touched.error, untouched.error]).toEqual([REPEAT_DATE_REQUIRED, REPEAT_DATE_REQUIRED]);
    expect(untouched.recurrence).toBeUndefined();
  });

  it("Takes the date from the due date", () => {
    const dates = [repeatDate({ dueDate: "2026-11-19" }), repeatDate({ dueDate: "" })];

    expect(dates).toEqual(["2026-11-19", null]);
  });
});
