import { expect, it } from "@effect/vitest";
import { CompletionService, ItemTree, type TodoItem } from "../../src/index.js";
import { earlier, item, now, projectId } from "../fixtures.js";

function tree(...rows: TodoItem[]) {
  return new ItemTree(projectId, null, rows);
}

function chain() {
  return tree(
    item("root"),
    item("parent", { parentItemId: "root" }),
    item("child", { parentItemId: "parent" }),
  );
}

function change(itemId: string, completedAtUtc: Temporal.Instant | null) {
  return { itemId, completedAtUtc };
}

it("completes every ancestor when the last open sub-item completes", () => {
  const items = chain();

  const result = CompletionService.complete(items, "child", true, now);

  expect(result).toEqual({
    kind: "applied",
    changes: [change("root", now), change("parent", now), change("child", now)],
  });
});

it("reopens completed ancestors when a child reopens", () => {
  const items = tree(
    item("root", { completedAtUtc: earlier }),
    item("child", { parentItemId: "root", completedAtUtc: earlier }),
  );

  const result = CompletionService.reopen(items, "child", true, now);

  expect(result).toEqual({
    kind: "applied",
    changes: [change("root", null), change("child", null)],
  });
});

it("reopens every ancestor when an open grandchild is added", () => {
  const items = tree(
    item("root", { completedAtUtc: earlier }),
    item("parent", { parentItemId: "root", completedAtUtc: earlier }),
  );

  items.add(item("child", { parentItemId: "parent" }), now);
  const result = CompletionService.afterStructureChanged(items, ["parent"], true, now);

  expect(result.changes).toEqual([change("root", null), change("parent", null)]);
});

it("completes the parent and grandparent after removing the last open child", () => {
  const items = tree(
    item("root"),
    item("parent", { parentItemId: "root" }),
    item("done", { parentItemId: "parent", completedAtUtc: earlier }),
  );

  const result = CompletionService.afterStructureChanged(items, ["parent"], true, now);

  expect(result.changes).toEqual([change("root", now), change("parent", now)]);
});

it.each([null, earlier])(
  "preserves a parent's completion when its last child is removed (%s)",
  (completedAtUtc) => {
    const items = tree(item("root", { completedAtUtc }), item("child", { parentItemId: "root" }));
    items.deleteSubtree("child", "batch", now);

    const result = CompletionService.afterStructureChanged(items, ["root"], true, now);

    expect(result.changes).toEqual([]);
  },
);

it("previews open descendants and completes the branch after confirmation", () => {
  const items = chain();

  const prompt = CompletionService.complete(items, "root", true, now);

  expect(prompt).toEqual({
    kind: "needs-confirmation",
    openSubItemCount: 2,
    openSubItemIds: ["parent", "child"],
  });
  expect(items.all.every((row) => row.completedAtUtc === null)).toBe(true);

  if (prompt.kind !== "needs-confirmation") {
    throw new Error("Expected a completion preview.");
  }
  expect(CompletionService.complete(items, "root", true, now, prompt.openSubItemIds)).toEqual({
    kind: "applied",
    changes: [change("root", now), change("parent", now), change("child", now)],
  });
});

it("blocks reopening a parent with completed children", () => {
  const items = tree(
    item("root", { completedAtUtc: earlier }),
    item("child", { parentItemId: "root", completedAtUtc: earlier }),
  );

  const result = CompletionService.reopen(items, "root", true, now);

  expect(result).toEqual({
    kind: "blocked",
    reason: "Reopen a sub-item instead, or add a new one.",
  });
  expect(items.get("root").completedAtUtc).toBe(earlier);
});

it("keeps completion independent when automatic completion is disabled", () => {
  const items = chain();

  const completion = CompletionService.complete(items, "root", false, now);
  const structure = CompletionService.afterStructureChanged(items, ["root"], false, now);

  expect(completion).toEqual({ kind: "applied", changes: [change("root", now)] });
  expect(structure.changes).toEqual([]);
});

it("reopens only the selected item when automatic completion is disabled", () => {
  const items = tree(
    item("root", { completedAtUtc: earlier }),
    item("child", { parentItemId: "root", completedAtUtc: earlier }),
  );

  const result = CompletionService.reopen(items, "child", false, now);

  expect(result).toEqual({ kind: "applied", changes: [change("child", null)] });
});

it("reopens completed ancestors when an open child is restored", () => {
  const items = tree(
    item("root", { completedAtUtc: earlier }),
    item("parent", { parentItemId: "root", completedAtUtc: earlier }),
    item("child", { parentItemId: "parent", deletedAtUtc: earlier, deletionBatchId: "batch" }),
  );

  items.restoreBatch("batch", now);
  const result = CompletionService.afterStructureChanged(items, ["parent"], true, now);

  expect(result.changes).toEqual([change("root", null), change("parent", null)]);
});

it("completes old ancestors when the last open child moves away", () => {
  const items = tree(
    item("root"),
    item("parent", { parentItemId: "root" }),
    item("done", { parentItemId: "parent", completedAtUtc: earlier }),
    item("child", { parentItemId: "parent" }),
  );

  items.move("child", null, now);
  const result = CompletionService.afterStructureChanged(items, ["parent"], true, now);

  expect(result.changes).toEqual([change("root", now), change("parent", now)]);
});

it("completes a parent with a finished child when its open child is deleted", () => {
  const items = tree(
    item("root"),
    item("done", { parentItemId: "root", completedAtUtc: earlier }),
    item("open", { parentItemId: "root" }),
  );

  items.deleteSubtree("open", "batch", now);
  const result = CompletionService.afterStructureChanged(items, ["root"], true, now);

  expect(result.changes).toEqual([change("root", now)]);
});

it("reopens the new parent when an open child moves in", () => {
  const items = tree(
    item("source"),
    item("destination", { completedAtUtc: earlier }),
    item("child", { parentItemId: "source" }),
  );

  items.move("child", "destination", now);
  const result = CompletionService.afterStructureChanged(items, ["destination"], true, now);

  expect(result.changes).toEqual([change("destination", null)]);
});

it("previews and reconciles multilevel changes while preserving existing completion timestamps", () => {
  const items = tree(
    item("root"),
    item("parent", { parentItemId: "root" }),
    item("done", { parentItemId: "parent", completedAtUtc: earlier }),
    item("open-root", { completedAtUtc: earlier }),
    item("open-child", { parentItemId: "open-root" }),
  );

  const preview = CompletionService.previewReconciliation(items, now);
  const result = CompletionService.reconcileAll(items, now);

  expect(preview).toEqual({ parentsToComplete: 2, parentsToReopen: 1 });
  expect(result.changes).toEqual([
    change("root", now),
    change("parent", now),
    change("open-root", null),
  ]);
  expect(items.get("done").completedAtUtc).toBe(earlier);
});

it("only classifies a branch as finished when the root and every active descendant are complete", () => {
  const doneChild = item("parent", { parentItemId: "root", completedAtUtc: earlier });
  const openRoot = tree(
    item("root"),
    doneChild,
    item("child", { parentItemId: "parent", completedAtUtc: earlier }),
  );
  const openGrandchild = tree(
    item("root", { completedAtUtc: earlier }),
    doneChild,
    item("child", { parentItemId: "parent" }),
  );

  expect(CompletionService.isFinished(openRoot, "root")).toBe(false);
  expect(CompletionService.isFinished(openGrandchild, "root")).toBe(false);
  openGrandchild.deleteSubtree("child", "batch", now);

  expect(CompletionService.isFinished(openGrandchild, "root")).toBe(true);
});

it("requests fresh confirmation when affected work changes without changing the count", () => {
  const before = tree(item("root"), item("old-child", { parentItemId: "root" }));
  const after = tree(item("root"), item("new-child", { parentItemId: "root" }));
  const prompt = CompletionService.complete(before, "root", true, now);
  if (prompt.kind !== "needs-confirmation") {
    throw new Error("Expected a completion preview.");
  }

  const result = CompletionService.complete(after, "root", true, now, prompt.openSubItemIds);

  expect(result).toEqual({
    kind: "needs-confirmation",
    openSubItemCount: 1,
    openSubItemIds: ["new-child"],
  });
});

it("reconciles both move paths before evaluating a shared ancestor", () => {
  const items = tree(
    item("root"),
    item("source", { parentItemId: "root" }),
    item("destination", { parentItemId: "root", completedAtUtc: earlier }),
    item("done", { parentItemId: "source", completedAtUtc: earlier }),
    item("moved", { parentItemId: "source" }),
  );

  items.move("moved", "destination", now);
  const result = CompletionService.afterStructureChanged(
    items,
    ["source", "destination"],
    true,
    now,
  );

  expect(result.changes).toEqual([change("source", now), change("destination", null)]);
});

it("returns open siblings in sibling order and finished siblings newest first at every level", () => {
  const items = tree(
    item("old-root", { completedAtUtc: earlier }),
    item("mixed-root", { sortOrder: 1, completedAtUtc: earlier }),
    item("open-root", { sortOrder: 2 }),
    item("new-root", { sortOrder: 3, completedAtUtc: now }),
    item("old-child", { parentItemId: "mixed-root", completedAtUtc: earlier }),
    item("open-child", { parentItemId: "mixed-root", sortOrder: 1 }),
    item("new-child", { parentItemId: "mixed-root", sortOrder: 2, completedAtUtc: now }),
  );

  const roots = CompletionService.partitionSiblings(items, null);
  const children = CompletionService.partitionSiblings(items, "mixed-root");
  const reopened = tree(
    ...items.all.map((row) => (row.id === "old-root" ? { ...row, completedAtUtc: null } : row)),
  );

  expect(roots.open.map((row) => row.id)).toEqual(["mixed-root", "open-root"]);
  expect(roots.finished.map((row) => row.id)).toEqual(["new-root", "old-root"]);
  expect(children.open.map((row) => row.id)).toEqual(["open-child"]);
  expect(children.finished.map((row) => row.id)).toEqual(["new-child", "old-child"]);
  expect(CompletionService.partitionSiblings(reopened, null).open.map((row) => row.id)).toEqual([
    "old-root",
    "mixed-root",
    "open-root",
  ]);
});

it("applies the approval when all previously previewed descendants are now complete", () => {
  const items = tree(
    item("root"),
    item("child", { parentItemId: "root", completedAtUtc: earlier }),
  );

  const result = CompletionService.complete(items, "root", true, now, ["child"]);

  expect(result).toEqual({ kind: "applied", changes: [change("root", now)] });
});
