import { describe, expect, it } from "@effect/vitest";
import {
  createItem,
  editItem,
  MetadataRuleError,
  type ItemEdit,
  type TodoItem,
} from "../../src/index.js";
import { item, now } from "../fixtures.js";

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

describe("editItem reminder choice", () => {
  it("Starts new items on the default reminder", () => {
    const created = createItem("A", "P", null, null, "Task", now);

    expect(created.reminder).toEqual({ kind: "default" });
  });

  it("Replaces the choice when given and keeps it when omitted", () => {
    const task = item("A");

    const chosen = editItem(task, edit(task, { reminder: { kind: "offset", minutes: 15 } }), now);
    const kept = editItem(chosen, edit(chosen, { title: "Renamed" }), now);

    expect(chosen.reminder).toEqual({ kind: "offset", minutes: 15 });
    expect(kept.reminder).toEqual({ kind: "offset", minutes: 15 });
  });

  it("Refuses an offset outside the list", () => {
    const task = item("A");

    const attempt = () =>
      editItem(task, edit(task, { reminder: { kind: "offset", minutes: 7 } }), now);

    expect(attempt).toThrow(MetadataRuleError);
  });
});
