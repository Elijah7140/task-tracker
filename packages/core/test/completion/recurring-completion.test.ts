import { describe, expect, it } from "@effect/vitest";
import {
  CompletionService,
  ItemTree,
  planStatusChange,
  recurrenceRule,
  type AppliedCompletion,
  type OccurrenceContext,
  type RecurrenceRule,
  type StatusLevel,
  type TodoItem,
} from "../../src/index.js";
import { item, now, projectId } from "../fixtures.js";

const due = Temporal.PlainDate.from("2026-11-13");
const daily = recurrenceRule("Daily");

function context(completionDate = due): OccurrenceContext {
  let sequence = 0;
  return {
    completionDate,
    newId: () => {
      sequence += 1;
      return `copy-${sequence}`;
    },
  };
}

function repeating(id: string, overrides: Partial<TodoItem> = {}, rule: RecurrenceRule = daily) {
  return item(id, {
    title: id,
    dueDate: due,
    recurrence: rule,
    recurrenceSeriesId: `${id}-series`,
    ...overrides,
  });
}

function parentAndChild(repeatParent: boolean) {
  const make = repeatParent ? repeating : item;
  return new ItemTree(projectId, null, [
    make("parent", { title: "parent" }),
    (repeatParent ? item : repeating)("child", { parentItemId: "parent", title: "child" }),
  ]);
}

function applied(result: ReturnType<typeof CompletionService.complete>): AppliedCompletion {
  if (result.kind !== "applied") {
    throw new Error(`Expected an applied completion, got ${result.kind}.`);
  }
  return result;
}

const completedIds = (result: AppliedCompletion) =>
  result.changes.flatMap((change) => (change.completedAtUtc === null ? [] : [change.itemId]));

describe("recurring completion", () => {
  it.each([false, true])(
    "An open repeat of the child keeps the parent open (completing the parent: %s)",
    (completeParent) => {
      const tree = parentAndChild(false);
      const target = completeParent ? "parent" : "child";

      const result = applied(
        CompletionService.complete(tree, target, true, now, ["child"], context()),
      );

      expect(completedIds(result)).toEqual(["child"]);
      const next = tree.children("parent").find((row) => row.id !== "child")!;
      expect(next).toMatchObject({ completedAtUtc: null, dueDate: due.add({ days: 1 }) });
      expect(result.occurrences).toEqual([{ sourceId: "child", itemId: next.id }]);
      expect(result.successorSourceIds).toEqual(["child"]);
    },
  );

  it("Auto-completing a repeating parent creates an open copy of it and its child", () => {
    const tree = parentAndChild(true);

    const result = applied(
      CompletionService.complete(tree, "child", true, now, undefined, context()),
    );

    expect(completedIds(result).toSorted()).toEqual(["child", "parent"]);
    const next = tree.children(null).find((row) => row.id !== "parent")!;
    const nextChild = tree.children(next.id)[0]!;
    expect(next).toMatchObject({ completedAtUtc: null, recurrenceSeriesId: "parent-series" });
    expect(nextChild).toMatchObject({ title: "child", completedAtUtc: null, recurrence: null });
    expect(result.occurrences!.map(({ sourceId }) => sourceId)).toEqual(["parent", "child"]);
  });

  it("Independent parent completion copies the open subtree from the local completion day", () => {
    const rule = recurrenceRule("Daily", { anchor: "CompletionDate" });
    const tree = new ItemTree(projectId, null, [
      repeating("parent", {}, rule),
      item("child", { parentItemId: "parent", title: "child" }),
    ]);

    const result = applied(
      CompletionService.complete(
        tree,
        "parent",
        false,
        now,
        undefined,
        context(due.subtract({ days: 1 })),
      ),
    );

    expect(completedIds(result)).toEqual(["parent"]);
    const next = tree.children(null).find((row) => row.id !== "parent")!;
    expect(next.dueDate?.toString()).toBe("2026-11-13");
    expect(tree.children(next.id)).toHaveLength(1);
  });

  it("Places the next occurrence directly after its source", () => {
    const tree = new ItemTree(projectId, null, [
      repeating("first", { sortOrder: 0 }),
      item("second", { sortOrder: 1 }),
    ]);

    CompletionService.complete(tree, "first", true, now, undefined, context());

    expect(tree.children(null).map((row) => row.id)).toEqual(["first", "copy-1", "second"]);
    expect(tree.children(null).map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it("Copies fields, moves the due date and resets completion and status", () => {
    const rule = recurrenceRule("Weekly", { weekdays: 16, endKind: "AfterCount", remaining: 3 });
    const source = repeating(
      "source",
      {
        description: "Details",
        ticketNumber: "AUD-1",
        itemTypeId: "type",
        priorityLevelId: "priority",
        statusId: "testing",
        dueTime: Temporal.PlainTime.from("12:30"),
      },
      rule,
    );
    const done = item("done", {
      parentItemId: "source",
      completedAtUtc: now,
      statusId: "released",
      reopenStatusId: "queued",
      recurrence: daily,
      recurrenceSeriesId: "done-series",
      dueDate: due,
    });
    const tree = new ItemTree(projectId, null, [source, done]);

    CompletionService.complete(tree, "source", true, now, undefined, context());

    const copy = tree.get("copy-1");
    expect(copy).toMatchObject({
      title: "source",
      description: "Details",
      ticketNumber: "AUD-1",
      itemTypeId: "type",
      priorityLevelId: "priority",
      statusId: "testing",
      reopenStatusId: null,
      completedAtUtc: null,
      recurrence: { ...rule, remaining: 2 },
      recurrenceSeriesId: "source-series",
      recurrenceSuccessorCreated: false,
    });
    expect(copy.dueDate?.toString()).toBe("2026-11-20");
    expect(copy.dueTime?.toString()).toBe("12:30:00");
    expect(tree.get("copy-2")).toMatchObject({
      statusId: "queued",
      completedAtUtc: null,
      recurrence: daily,
      recurrenceSeriesId: "copy-3",
    });
    expect(tree.get("copy-2").dueDate?.toString()).toBe("2026-11-20");
  });

  it("Reports the last repeat without creating an occurrence", () => {
    const rule = recurrenceRule("Daily", { endKind: "AfterCount", remaining: 1 });
    const tree = new ItemTree(projectId, null, [repeating("final", {}, rule)]);

    const result = applied(
      CompletionService.complete(tree, "final", true, now, undefined, context()),
    );

    expect(result).toMatchObject({ lastRepeat: true, occurrences: [], successorSourceIds: [] });
    expect(tree.all).toHaveLength(1);
  });

  it("Creates no second successor once the occurrence has one", () => {
    const tree = new ItemTree(projectId, null, [
      repeating("again", { recurrenceSuccessorCreated: true }),
    ]);

    const result = applied(
      CompletionService.complete(tree, "again", true, now, undefined, context()),
    );

    expect(result.occurrences).toEqual([]);
    expect(result.lastRepeat).toBe(false);
    expect(completedIds(result)).toEqual(["again"]);
  });

  it("Completing an already completed occurrence changes nothing", () => {
    const tree = new ItemTree(projectId, null, [repeating("done", { completedAtUtc: now })]);

    const result = applied(
      CompletionService.complete(tree, "done", true, now, undefined, context()),
    );

    expect(result.changes).toEqual([]);
    expect(result.occurrences).toEqual([]);
  });

  it("Without a recurrence context, completion creates no occurrence", () => {
    const tree = new ItemTree(projectId, null, [repeating("plain")]);

    const result = applied(CompletionService.complete(tree, "plain", true, now));

    expect(completedIds(result)).toEqual(["plain"]);
    expect(tree.all).toHaveLength(1);
  });

  it("A structural change that completes a repeating parent creates its next occurrence", () => {
    const tree = new ItemTree(projectId, null, [
      repeating("parent"),
      item("finished", { parentItemId: "parent", completedAtUtc: now, sortOrder: 0 }),
      item("open", { parentItemId: "parent", sortOrder: 1 }),
    ]);
    tree.deleteSubtree("open", "batch", now);

    const result = CompletionService.afterStructureChanged(tree, ["parent"], true, now, context());

    expect(completedIds(result)).toEqual(["parent"]);
    expect(result.occurrences).toEqual([
      { sourceId: "parent", itemId: "copy-1" },
      { sourceId: "finished", itemId: "copy-2" },
    ]);
    expect(result.successorSourceIds).toEqual(["parent"]);
    expect(tree.get("copy-2")).toMatchObject({ parentItemId: "copy-1", completedAtUtc: null });
  });

  it("A structural change keeps a repeating parent open when its children stay open", () => {
    const tree = new ItemTree(projectId, null, [
      repeating("parent"),
      item("finished", { parentItemId: "parent", completedAtUtc: now, sortOrder: 0 }),
      item("open", { parentItemId: "parent", sortOrder: 1 }),
    ]);
    tree.indent("open", now);

    const result = CompletionService.afterStructureChanged(
      tree,
      ["parent", "finished"],
      true,
      now,
      context(),
    );

    expect(result.changes).toEqual([{ itemId: "finished", completedAtUtc: null }]);
    expect(result.occurrences).toEqual([]);
  });
});

describe("recurring status changes", () => {
  const statuses: StatusLevel[] = [
    {
      id: "testing",
      name: "Testing",
      kind: "Open",
      isArchived: false,
      sortOrder: 0,
      isInProgress: false,
    },
    {
      id: "done",
      name: "Completed",
      kind: "Done",
      isArchived: false,
      sortOrder: 1,
      isInProgress: false,
    },
  ];

  it("A Done status kept from the parent by a new occurrence explains why", () => {
    const tree = parentAndChild(false);

    const result = planStatusChange(
      tree,
      "parent",
      "done",
      statuses,
      true,
      now,
      ["child"],
      context(),
    );

    expect(result).toMatchObject({
      kind: "applied",
      parentKeptOpenMessage: "A new occurrence of a sub-item keeps 'parent' open.",
    });
    expect(completedIds(result as AppliedCompletion)).toEqual(["child"]);
  });

  it("A Done status on a repeating item creates the next occurrence", () => {
    const tree = new ItemTree(projectId, null, [repeating("task", { statusId: "testing" })]);

    const result = planStatusChange(
      tree,
      "task",
      "done",
      statuses,
      true,
      now,
      undefined,
      context(),
    );

    expect(result).toMatchObject({ kind: "applied", successorSourceIds: ["task"] });
    expect(result).not.toHaveProperty("parentKeptOpenMessage");
    expect(tree.get("copy-1").statusId).toBe("testing");
  });
});
