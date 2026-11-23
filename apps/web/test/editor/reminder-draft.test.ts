import type { Item } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  describeOffset,
  isReminderChanged,
  reminderFromValue,
  reminderValue,
  storedReminder,
} from "../../src/editor/reminder-draft.js";

const ITEM: typeof Item.Type = {
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
  deletedAtUtc: null,
  deletionBatchId: null,
};

describe("reminder choice values", () => {
  it("Round-trips Default, None and offsets through the select value", () => {
    const values = ["default", "none", "15"];

    const choices = values.map(reminderFromValue);

    expect(choices).toEqual([
      { kind: "default" },
      { kind: "none" },
      { kind: "offset", minutes: 15 },
    ]);
    expect(choices.map(reminderValue)).toEqual(values);
  });

  it("Treats an item without a stored choice as Default", () => {
    const stored = storedReminder(ITEM);

    expect(stored).toEqual({ kind: "default" });
  });
});

describe("isReminderChanged", () => {
  it("Is dirty only when the draft differs from the stored choice", () => {
    const item = { ...ITEM, reminder: { kind: "offset", minutes: 30 } as const };

    const results = [
      isReminderChanged(item, null),
      isReminderChanged(item, { kind: "offset", minutes: 30 }),
      isReminderChanged(item, { kind: "none" }),
    ];

    expect(results).toEqual([false, false, true]);
  });
});

describe("describeOffset", () => {
  it("Uses the listed label or names an unlisted offset in minutes", () => {
    const labels = [describeOffset(1440), describeOffset(45), describeOffset(1)];

    expect(labels).toEqual(["1 day before", "45 minutes before", "1 minute before"]);
  });
});
