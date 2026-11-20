import type { Item } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  draftTexts,
  isBuiltInDraftChanged,
  itemEdit,
  storedTexts,
} from "../../src/editor/item-draft.js";

type ItemRecord = typeof Item.Type;

const TYPE_ID = "019A0000-0000-7000-8000-000000001000";
const PRIORITY_ID = "019A0000-0000-7000-8000-000000002000";

const ITEM: ItemRecord = {
  id: "0190A1B2-0000-7000-8000-000000000001",
  projectId: "0190A1B2-0000-7000-8000-000000000002",
  folderId: null,
  parentItemId: null,
  title: "Task",
  description: null,
  ticketNumber: "OPS-1",
  itemTypeId: TYPE_ID,
  priorityLevelId: PRIORITY_ID,
  dueDate: "2026-11-20",
  dueTime: "17:00:00.1234567",
  scheduledStart: "2026-11-19T09:30:00",
  scheduledEnd: null,
  sortOrder: 0,
  createdAtUtc: "2026-11-13T12:00:00Z",
  updatedAtUtc: "2026-11-13T12:00:00Z",
  statusId: null,
  reopenStatusId: null,
  completedAtUtc: null,
  deletedAtUtc: null,
  deletionBatchId: null,
};

const STORED_EDIT = {
  title: "Task",
  description: null,
  ticketNumber: "OPS-1",
  itemTypeId: TYPE_ID,
  priorityLevelId: PRIORITY_ID,
  dueDate: "2026-11-20",
  dueTime: "17:00:00.1234567",
  scheduledStart: "2026-11-19T09:30:00",
  scheduledEnd: null,
};

describe("storedTexts", () => {
  it("Shows built-in values in the forms the inputs use", () => {
    const texts = storedTexts(ITEM);

    expect(texts).toEqual({
      title: "Task",
      description: "",
      ticketNumber: "OPS-1",
      itemTypeId: TYPE_ID,
      priorityLevelId: PRIORITY_ID,
      dueDate: "2026-11-20",
      dueTime: "17:00",
      statusId: "",
      scheduledStart: "2026-11-19T09:30",
      scheduledEnd: "",
    });
  });
});

describe("draftTexts", () => {
  it("Shows typed values over the stored ones", () => {
    const texts = draftTexts(ITEM, { title: "Typed" });

    expect(texts.title).toBe("Typed");
    expect(texts.ticketNumber).toBe("OPS-1");
  });
});

describe("isBuiltInDraftChanged", () => {
  it("Is false for a freshly opened draft", () => {
    const changed = isBuiltInDraftChanged(ITEM, {});

    expect(changed).toBe(false);
  });

  it("Is false when typed values match the stored ones", () => {
    const changed = isBuiltInDraftChanged(ITEM, { title: "Task", dueTime: "17:00" });

    expect(changed).toBe(false);
  });

  it("Is true when a typed value differs", () => {
    const changed = isBuiltInDraftChanged(ITEM, { description: "Notes" });

    expect(changed).toBe(true);
  });
});

describe("itemEdit", () => {
  it("Sends the stored values, with their full precision, when nothing changed", () => {
    const edit = itemEdit(ITEM, {});

    expect(edit).toEqual(STORED_EDIT);
  });

  it("Sends typed values and clears blank text", () => {
    const edit = itemEdit(ITEM, {
      title: "Renamed",
      description: "Line one\nLine two",
      ticketNumber: "  ",
      dueTime: "08:15",
      scheduledEnd: "2026-11-19T10:00",
    });

    expect(edit).toEqual({
      ...STORED_EDIT,
      title: "Renamed",
      description: "Line one\nLine two",
      ticketNumber: null,
      dueTime: "08:15",
      scheduledEnd: "2026-11-19T10:00",
    });
  });

  it("Clears text that is only .NET white space and keeps a byte-order mark", () => {
    const edit = itemEdit(ITEM, { description: "\u0085\u2028", ticketNumber: "\ufeff" });

    expect(edit.description).toBeNull();
    expect(edit.ticketNumber).toBe("\ufeff");
  });

  it("Sends a status only when it changed, and None as no status", () => {
    const unchanged = itemEdit(ITEM, { statusId: "" });
    const chosen = itemEdit(ITEM, { statusId: TYPE_ID });
    const cleared = itemEdit({ ...ITEM, statusId: TYPE_ID }, { statusId: "" });

    expect(unchanged).not.toHaveProperty("statusId");
    expect(chosen).toEqual({ ...STORED_EDIT, statusId: TYPE_ID });
    expect(cleared).toEqual({ ...STORED_EDIT, statusId: null });
  });

  it("Clears the type and priority when None is chosen", () => {
    const edit = itemEdit(ITEM, { itemTypeId: "", priorityLevelId: "" });

    expect(edit.itemTypeId).toBeNull();
    expect(edit.priorityLevelId).toBeNull();
  });

  it("Keeps an archived type and priority until they are replaced", () => {
    const edit = itemEdit(ITEM, { title: "Renamed" });

    expect(edit.itemTypeId).toBe(TYPE_ID);
    expect(edit.priorityLevelId).toBe(PRIORITY_ID);
  });

  it("Clears dates and times that were emptied", () => {
    const edit = itemEdit(ITEM, { dueDate: "", dueTime: "", scheduledStart: "" });

    expect(edit.dueDate).toBeNull();
    expect(edit.dueTime).toBeNull();
    expect(edit.scheduledStart).toBeNull();
  });
});
