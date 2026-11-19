import { expect, it } from "@effect/vitest";
import {
  completionStatus,
  CompletionService,
  ItemTree,
  planStatusChange,
  type CompletionChange,
  type StatusLevel,
  type TodoItem,
} from "../../src/index.js";
import { earlier, item, now, projectId } from "../fixtures.js";

const statuses: StatusLevel[] = [
  { id: "testing", name: "Testing", kind: "Open", isArchived: false, sortOrder: 0 },
  { id: "done", name: "Completed", kind: "Done", isArchived: false, sortOrder: 1 },
  { id: "released", name: "Released", kind: "Done", isArchived: false, sortOrder: 2 },
  { id: "blocked", name: "Blocked", kind: "Open", isArchived: true, sortOrder: 3 },
];

function tree(...rows: TodoItem[]) {
  return new ItemTree(projectId, null, rows);
}

/** Applies completion changes the way the server persists them, then returns the stored rows. */
function applyChanges(rows: readonly TodoItem[], changes: readonly CompletionChange[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const { itemId, completedAtUtc } of changes) {
    const row = byId.get(itemId)!;
    byId.set(itemId, { ...row, ...completionStatus(row, completedAtUtc, "done"), completedAtUtc });
  }
  return [...byId.values()];
}

it("Remembers an open status on completion and restores it on reopen", () => {
  const task = item("task", { statusId: "testing" });

  const completed = completionStatus(task, now, "done");
  const reopened = completionStatus({ ...task, ...completed, completedAtUtc: now }, null, "done");

  expect(completed).toEqual({ statusId: "done", reopenStatusId: "testing" });
  expect(reopened).toEqual({ statusId: "testing", reopenStatusId: null });
});

it("Cascaded completion and reopening keep every status in step", () => {
  const rows = [
    item("root", { statusId: "testing" }),
    item("parent", { parentItemId: "root", statusId: "testing" }),
    item("child", { parentItemId: "parent", statusId: "testing" }),
  ];

  const completion = CompletionService.complete(tree(...rows), "child", true, now);
  const completed = applyChanges(rows, completion.kind === "applied" ? completion.changes : []);
  const reopening = CompletionService.reopen(tree(...completed), "child", true, now);
  const reopened = applyChanges(completed, reopening.kind === "applied" ? reopening.changes : []);

  expect(completed.map(({ statusId, reopenStatusId }) => [statusId, reopenStatusId])).toEqual([
    ["done", "testing"],
    ["done", "testing"],
    ["done", "testing"],
  ]);
  expect(reopened.map(({ statusId, reopenStatusId }) => [statusId, reopenStatusId])).toEqual([
    ["testing", null],
    ["testing", null],
    ["testing", null],
  ]);
});

it("A Done status completes an open item and asks before completing open sub-items", () => {
  const items = tree(item("parent"), item("child", { parentItemId: "parent" }));

  const prompt = planStatusChange(items, "parent", "released", statuses, true, now);
  const confirmed = planStatusChange(items, "parent", "released", statuses, true, now, ["child"]);

  expect(prompt).toEqual({
    kind: "needs-confirmation",
    openSubItemCount: 1,
    openSubItemIds: ["child"],
  });
  expect(confirmed).toEqual({
    kind: "applied",
    changes: [
      { itemId: "parent", completedAtUtc: now },
      { itemId: "child", completedAtUtc: now },
    ],
  });
});

it("An Open status or none reopens a completed item through the reopen rules", () => {
  const leaf = tree(item("leaf", { statusId: "done", completedAtUtc: earlier }));
  const parent = tree(
    item("parent", { statusId: "done", completedAtUtc: earlier }),
    item("child", { parentItemId: "parent", statusId: "done", completedAtUtc: earlier }),
  );

  const reopened = planStatusChange(leaf, "leaf", "testing", statuses, true, now);
  const cleared = planStatusChange(leaf, "leaf", null, statuses, true, now);
  const blocked = planStatusChange(parent, "parent", null, statuses, true, now);

  expect(reopened).toEqual({
    kind: "applied",
    changes: [{ itemId: "leaf", completedAtUtc: null }],
  });
  expect(cleared).toEqual(reopened);
  expect(blocked).toEqual({
    kind: "blocked",
    reason: "Reopen a sub-item instead, or add a new one.",
  });
});

it("A status of the same kind changes no completion", () => {
  const done = tree(item("done", { statusId: "done", completedAtUtc: earlier }));
  const open = tree(item("open"));

  const switched = planStatusChange(done, "done", "released", statuses, true, now);
  const assigned = planStatusChange(open, "open", "testing", statuses, true, now);

  expect(switched).toEqual({ kind: "applied", changes: [] });
  expect(assigned).toEqual({ kind: "applied", changes: [] });
});

it("Archived and missing statuses cannot be assigned", () => {
  const items = tree(item("task"));

  const archived = () => planStatusChange(items, "task", "blocked", statuses, true, now);
  const missing = () => planStatusChange(items, "task", "unknown", statuses, true, now);

  expect(archived).toThrow("Status is missing or archived.");
  expect(missing).toThrow("Status is missing or archived.");
});
