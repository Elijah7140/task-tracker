import { expect, it } from "@effect/vitest";
import {
  type FieldValueInput,
  type ItemEdit,
  type ItemLinkInput,
  MetadataRuleError,
  RecurrenceWeekday,
  recurrenceRule,
  type RecurrenceRule,
} from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { UndoService } from "../../../src/services/undo-service.js";
import {
  bool,
  editFields,
  filter,
  query,
  type SearchServices,
  sortedTitles,
  withSearchServices,
} from "./search-fixtures.js";

const due = Temporal.PlainDate.from("2026-11-13");
const weekly = recurrenceRule("Weekly", { weekdays: RecurrenceWeekday.Friday });
const completedStatusId = "019A0000-0000-7000-8000-000000000204";
const testingStatusId = "019A0000-0000-7000-8000-000000000203";

/** The legacy test's edit: every built-in date set, plus an optional rule. */
function repeatEdit(title: string, recurrence: RecurrenceRule | null): ItemEdit {
  return editFields(title, {
    description: "Details",
    ticketNumber: "AUD-1",
    dueDate: due,
    dueTime: Temporal.PlainTime.from("12:30"),
    scheduledStart: due.toPlainDateTime("09:15"),
    scheduledEnd: due.toPlainDateTime("10:45"),
    recurrence,
  });
}

interface StoredItem {
  readonly Id: string;
  readonly ParentItemId: string | null;
  readonly Title: string;
  readonly Description: string | null;
  readonly TicketNumber: string | null;
  readonly TicketRank: number | null;
  readonly StatusId: string | null;
  readonly ReopenStatusId: string | null;
  readonly DueDate: string | null;
  readonly DueTime: string | null;
  readonly ScheduledStart: string | null;
  readonly ScheduledEnd: string | null;
  readonly CompletedAtUtc: string | null;
  readonly SortOrder: number;
  readonly DeletedAtUtc: string | null;
  readonly RecurrenceFrequency: number | null;
  readonly RecurrenceRemaining: number | null;
  readonly RecurrenceSeriesId: string | null;
  readonly RecurrenceSuccessorCreated: number;
}

const setup = (svc: SearchServices) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
    const project = yield* svc.projects.create("Project");
    const projectId = project.id;
    const create = (title: string, parentId: string | null = null) =>
      svc.items.create(projectId, null, parentId, title);
    const repeat = (
      itemId: string,
      title: string,
      rule: RecurrenceRule | null,
      values: readonly FieldValueInput[] = [],
      links?: readonly ItemLinkInput[],
    ) => svc.items.edit(itemId, repeatEdit(title, rule), values, undefined, links);
    const complete = (itemId: string, completed = true) =>
      svc.items.setCompleted(projectId, null, itemId, completed);
    const read = (itemId: string) =>
      svc.sql<StoredItem>`SELECT * FROM TodoItem WHERE Id = ${itemId}`.pipe(
        Effect.map((rows) => rows[0]!),
      );
    const roots = svc.sql<StoredItem>`SELECT * FROM TodoItem
      WHERE ParentItemId IS NULL AND DeletedAtUtc IS NULL ORDER BY SortOrder`;
    const children = (parentId: string) =>
      svc.sql<StoredItem>`SELECT * FROM TodoItem WHERE ParentItemId = ${parentId}`;
    const exists = (itemId: string) =>
      svc.sql<{ count: number }>`SELECT count(*) AS count FROM TodoItem WHERE Id = ${itemId}`.pipe(
        Effect.map((rows) => rows[0]!.count === 1),
      );
    /** The only active top-level item other than `sourceId`. */
    const successorOf = (sourceId: string) =>
      Effect.map(roots, (rows) => {
        const others = rows.filter((row) => row.Id !== sourceId);
        expect(others).toHaveLength(1);
        return others[0]!;
      });
    return {
      projectId,
      create,
      repeat,
      complete,
      read,
      roots,
      children,
      exists,
      successorOf,
      undo: yield* UndoService,
    };
  });

type World = Effect.Success<ReturnType<typeof setup>>;

const test = (
  name: string,
  body: (
    svc: SearchServices,
    world: World,
  ) => Effect.Effect<void, unknown, SqlClient.SqlClient | UndoService>,
) =>
  it.effect(name, () =>
    withSearchServices((svc) => Effect.flatMap(setup(svc), (world) => body(svc, world))),
  );

/** A repeating parent "Audit" with a completed child and an open child. */
const createBranch = Effect.fnUntraced(function* (world: World) {
  const parent = yield* world.create("Audit");
  const finished = yield* world.create("Complete", parent.id);
  const open = yield* world.create("Open", parent.id);
  yield* world.repeat(parent.id, "Audit", weekly);
  yield* world.complete(finished.id);
  return { parent, finished, open };
});

/** A daily repeat that allows exactly one more occurrence. */
const createTwoOccurrenceSeries = Effect.fnUntraced(function* (world: World) {
  const item = yield* world.create("Audit");
  const rule = recurrenceRule("Daily", { endKind: "AfterCount", remaining: 2 });
  yield* world.repeat(item.id, "Audit", rule);
  return item;
});

const assertCopiedTree = Effect.fnUntraced(function* (
  svc: SearchServices,
  world: World,
  sourceId: string,
  siblingId: string,
) {
  const roots = yield* world.roots;
  expect(roots.map(({ Id }) => Id)).toEqual([sourceId, roots[1]!.Id, siblingId]);
  const next = roots[1]!;
  const [child] = yield* world.children(next.Id);
  expect(next).toMatchObject({
    Title: "Audit",
    Description: "Details",
    TicketNumber: "AUD-1",
    CompletedAtUtc: null,
    RecurrenceSeriesId: roots[0]!.RecurrenceSeriesId,
    RecurrenceSuccessorCreated: 0,
    DueDate: "2026-11-20",
    DueTime: "12:30:00",
    ScheduledStart: "2026-11-20 09:15:00",
    ScheduledEnd: "2026-11-20 10:45:00",
  });
  // A numbered next occurrence is a new ticket at the bottom of its section (§7.16).
  expect(next.TicketRank).not.toBeNull();
  expect(child).toMatchObject({
    Title: "Check figures",
    DueDate: "2026-11-20",
    CompletedAtUtc: null,
  });
  const values = yield* svc.items.loadFieldValues(next.Id);
  expect(values.map(({ textValue }) => textValue)).toEqual(["verified"]);
  const links = yield* svc.items.loadLinks(next.Id);
  expect(links.map(({ url, title }) => ({ url, title }))).toEqual([
    { url: "https://example.com/audit", title: "Runbook" },
  ]);
  const area = yield* svc.items.loadArea(world.projectId, null);
  const copied = area.items.open.find((node) => node.item.id === next.Id);
  expect(copied?.item.recurrence).toEqual(weekly);
  return next;
});

test("Completing the last child copies the repeating parent and undo removes the copy", (svc, world) =>
  Effect.gen(function* () {
    const parent = yield* world.create("Audit");
    const child = yield* world.create("Check figures", parent.id);
    const sibling = yield* world.create("Other work");
    const field = yield* svc.fields.create("Result", "Text", null);
    yield* world.repeat(
      parent.id,
      "Audit",
      weekly,
      [{ fieldDefinitionId: field.id, textValue: "verified" }],
      [{ id: null, url: "https://example.com/audit", title: "Runbook" }],
    );
    yield* world.repeat(child.id, "Check figures", null);

    yield* world.complete(child.id);

    const next = yield* assertCopiedTree(svc, world, parent.id, sibling.id);
    expect((yield* world.read(parent.id)).CompletedAtUtc).not.toBeNull();
    expect((yield* world.undo.status()).undo).toBe("Complete 'Check figures'");

    yield* world.undo.apply("undo");

    expect(yield* world.exists(next.Id)).toBe(false);
    expect((yield* world.read(parent.id)).CompletedAtUtc).toBeNull();
    expect((yield* world.read(child.id)).CompletedAtUtc).toBeNull();
    expect((yield* world.read(sibling.id)).SortOrder).toBe(1);
    expect((yield* world.read(parent.id)).RecurrenceSuccessorCreated).toBe(0);
    yield* world.undo.apply("redo");
    yield* assertCopiedTree(svc, world, parent.id, sibling.id);
  }));

test("Undo of a numbered next occurrence unranks the legacy ticket it ranked in another project", (svc, world) =>
  Effect.gen(function* () {
    const other = yield* svc.projects.create("Other");
    const legacy = yield* svc.items.create(other.id, null, null, "Legacy");
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", weekly);
    yield* svc.sql`UPDATE TodoItem SET TicketNumber = 'OLD-1', TicketRank = NULL
      WHERE Id = ${legacy.id}`;

    yield* world.complete(item.id);

    expect((yield* world.read(legacy.id)).TicketRank).not.toBeNull();

    yield* world.undo.apply("undo");

    expect((yield* world.read(legacy.id)).TicketRank).toBeNull();
    yield* world.undo.apply("redo");
    expect((yield* world.read(legacy.id)).TicketRank).not.toBeNull();
  }));

test("The next occurrence copies the reminder choice without delivery or snooze", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", weekly);
    yield* svc.sql`UPDATE TodoItem SET ReminderMode = 2, ReminderOffsetMinutes = 15,
        ReminderDeliveredFor = 1, SnoozedUntilUtc = 2, SnoozedForUtc = 3 WHERE Id = ${item.id}`;

    yield* world.complete(item.id);

    const next = yield* world.successorOf(item.id);
    const [reminder] = yield* svc.sql`SELECT ReminderMode, ReminderOffsetMinutes,
        ReminderDeliveredFor, SnoozedUntilUtc, SnoozedForUtc FROM TodoItem WHERE Id = ${next.Id}`;
    expect(reminder).toEqual({
      ReminderMode: 2,
      ReminderOffsetMinutes: 15,
      ReminderDeliveredFor: null,
      SnoozedUntilUtc: null,
      SnoozedForUtc: null,
    });
  }));

test("The next occurrence takes the remembered open status", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", weekly);
    yield* svc.items.setStatus(item.id, testingStatusId);

    yield* svc.items.setStatus(item.id, completedStatusId);

    const next = yield* world.successorOf(item.id);
    expect(next).toMatchObject({
      StatusId: testingStatusId,
      ReopenStatusId: null,
      CompletedAtUtc: null,
    });
    expect(yield* world.read(item.id)).toMatchObject({
      StatusId: completedStatusId,
      ReopenStatusId: testingStatusId,
    });
  }));

test("Skip moves the same row and undo restores the dates and the count", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", { ...weekly, endKind: "AfterCount", remaining: 2 });
    const series = (yield* world.read(item.id)).RecurrenceSeriesId;

    const advanced = yield* svc.items.skipRepeat(item.id);

    expect(advanced).toBe(true);
    expect(yield* world.read(item.id)).toMatchObject({
      CompletedAtUtc: null,
      DueDate: "2026-11-20",
      ScheduledStart: "2026-11-20 09:15:00",
      RecurrenceRemaining: 1,
    });
    expect((yield* world.undo.status()).undo).toBe("Skip repeat for 'Audit'");
    expect(yield* svc.items.skipRepeat(item.id)).toBe(false);
    expect((yield* world.undo.status()).undo).toBe("Skip repeat for 'Audit'");

    yield* world.undo.apply("undo");

    expect(yield* world.read(item.id)).toMatchObject({
      DueDate: "2026-11-13",
      ScheduledStart: "2026-11-13 09:15:00",
      RecurrenceRemaining: 2,
      RecurrenceSeriesId: series,
    });
    expect(yield* world.roots).toHaveLength(1);
  }));

test("Skip refuses a completed occurrence", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", weekly);
    yield* world.complete(item.id);

    const failure = yield* Effect.flip(svc.items.skipRepeat(item.id));

    expect(failure).toEqual(new MetadataRuleError("Only an open repeating item can be skipped."));
  }));

test("Reopening keeps the next occurrence and stopping only removes the selected rule", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", weekly);
    yield* world.complete(item.id);

    yield* world.complete(item.id, false);
    yield* svc.items.stopRepeating(item.id);

    const area = yield* svc.items.loadArea(world.projectId, null);
    const other = area.items.open.find((node) => node.item.id !== item.id)!;
    expect(other.item.recurrence).toEqual(weekly);
    expect(yield* world.read(item.id)).toMatchObject({
      RecurrenceFrequency: null,
      RecurrenceSeriesId: null,
    });
    expect((yield* world.undo.status()).undo).toBe("Stop repeating 'Audit'");

    yield* world.undo.apply("undo");

    expect((yield* world.read(item.id)).RecurrenceFrequency).toBe(2);
  }));

test("Completing the final occurrence keeps it as history and reports the last repeat", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    const rule = { ...weekly, endKind: "AfterCount" as const, remaining: 1 };
    yield* world.repeat(item.id, "Audit", rule);

    const completion = yield* world.complete(item.id);

    expect(completion).toMatchObject({ kind: "applied", lastRepeat: true });
    const area = yield* svc.items.loadArea(world.projectId, null);
    expect(area.items.open).toEqual([]);
    expect(area.items.finished.map((node) => node.item)).toMatchObject([
      { id: item.id, recurrence: rule },
    ]);
  }));

test("Trash restore keeps the original rule and series", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    yield* world.repeat(item.id, "Audit", weekly);
    const series = (yield* world.read(item.id)).RecurrenceSeriesId;
    const batch = yield* svc.items.delete(world.projectId, null, item.id);

    yield* svc.trash.restore(batch);

    expect(yield* world.read(item.id)).toMatchObject({
      DeletedAtUtc: null,
      RecurrenceFrequency: 2,
      RecurrenceSeriesId: series,
    });
  }));

for (const [name, filters, expected] of [
  ["repeats:yes", [filter("repeats", "equals", bool(true))], ["Audit"]],
  ["repeats:no", [filter("repeats", "equals", bool(false))], ["Plain"]],
  ["has:repeats", [filter("repeats", "isNotEmpty")], ["Audit"]],
  ["no:repeats", [filter("repeats", "isEmpty")], ["Plain"]],
] as const) {
  test(`The ${name} filter finds the matching item`, (svc, world) =>
    Effect.gen(function* () {
      const repeating = yield* world.create("Audit");
      yield* world.create("Plain");
      yield* world.repeat(repeating.id, "Audit", weekly);

      const results = yield* svc.search.search(query(filters));

      expect(sortedTitles(results)).toEqual(expected);
    }));
}

test("A scheduled-only occurrence keeps its times and repeated completion is idempotent", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Meeting");
    yield* svc.items.edit(
      item.id,
      { ...repeatEdit("Meeting", weekly), dueDate: null, dueTime: null },
      [],
    );

    yield* world.complete(item.id);
    yield* world.complete(item.id);

    const next = yield* world.successorOf(item.id);
    expect(next).toMatchObject({
      DueDate: null,
      ScheduledStart: "2026-11-20 09:15:00",
      ScheduledEnd: "2026-11-20 10:45:00",
    });
  }));

for (const operation of ["indent", "move", "drop"] as const) {
  test(`Moving an open child under its completed sibling by ${operation} keeps the repeating parent open`, (svc, world) =>
    Effect.gen(function* () {
      const { parent, finished, open } = yield* createBranch(world);
      const { projectId } = world;

      if (operation === "indent") {
        yield* svc.items.indent(projectId, null, open.id);
      } else if (operation === "move") {
        yield* svc.items.move(projectId, null, open.id, finished.id);
      } else {
        yield* svc.items.drop(projectId, null, open.id, finished.id, "into");
      }

      const roots = yield* world.roots;
      expect(roots.map(({ Id, CompletedAtUtc }) => ({ Id, CompletedAtUtc }))).toEqual([
        { Id: parent.id, CompletedAtUtc: null },
      ]);
      const [child] = yield* world.children(parent.id);
      expect(child).toMatchObject({ Id: finished.id, CompletedAtUtc: null });
      expect((yield* world.children(finished.id)).map(({ Id }) => Id)).toEqual([open.id]);
    }));
}

test("Deleting the last open child completes the repeating parent and creates its successor", (svc, world) =>
  Effect.gen(function* () {
    const { parent, open } = yield* createBranch(world);

    yield* svc.items.delete(world.projectId, null, open.id);

    const next = yield* world.successorOf(parent.id);
    expect(next.CompletedAtUtc).toBeNull();
    expect((yield* world.children(next.Id)).map(({ Title }) => Title)).toEqual(["Complete"]);
    expect((yield* world.read(parent.id)).CompletedAtUtc).not.toBeNull();
    expect((yield* world.undo.status()).undo).toBe("Delete 'Open'");
  }));

for (const redo of [false, true]) {
  test(`Recompletion keeps one final occurrence${redo ? " after redo" : ""}`, (_svc, world) =>
    Effect.gen(function* () {
      const item = yield* createTwoOccurrenceSeries(world);
      yield* world.complete(item.id);
      const next = yield* world.successorOf(item.id);
      if (redo) {
        yield* world.undo.apply("undo");
        expect(yield* world.exists(next.Id)).toBe(false);
        yield* world.undo.apply("redo");
      }

      yield* world.complete(item.id, false);
      yield* world.complete(item.id);

      const final = yield* world.successorOf(item.id);
      expect(final).toMatchObject({ Id: next.Id, CompletedAtUtc: null, RecurrenceRemaining: 1 });
    }));
}

test("Undo of completion allows a new successor when completed again", (_svc, world) =>
  Effect.gen(function* () {
    const item = yield* createTwoOccurrenceSeries(world);
    yield* world.complete(item.id);
    const next = yield* world.successorOf(item.id);

    yield* world.undo.apply("undo");
    yield* world.complete(item.id);

    expect((yield* world.successorOf(item.id)).Id).not.toBe(next.Id);
  }));

for (const purge of [false, true]) {
  test(`Recompletion does not replace a ${purge ? "purged" : "deleted"} successor`, (svc, world) =>
    Effect.gen(function* () {
      const item = yield* createTwoOccurrenceSeries(world);
      yield* world.complete(item.id);
      const next = yield* world.successorOf(item.id);
      const batch = yield* svc.items.delete(world.projectId, null, next.Id);
      if (purge) {
        yield* svc.trash.purge(batch);
      }

      yield* world.complete(item.id, false);
      yield* world.complete(item.id);

      const roots = yield* world.roots;
      expect(
        roots.map(({ Id, CompletedAtUtc }) => ({ Id, done: CompletedAtUtc !== null })),
      ).toEqual([{ Id: item.id, done: true }]);
    }));
}

test("Saving Done in the editor copies the edited links and custom values to the successor", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    const removed = yield* svc.fields.create("Removed", "Text", null);
    const edited = yield* svc.fields.create("Edited", "Text", null);
    const added = yield* svc.fields.create("Added", "Text", null);
    yield* world.repeat(
      item.id,
      "Audit",
      weekly,
      [
        { fieldDefinitionId: removed.id, textValue: "Old" },
        { fieldDefinitionId: edited.id, textValue: "Before" },
      ],
      [
        { id: null, url: "https://example.com/remove", title: null },
        { id: null, url: "https://example.com/keep", title: "Before" },
      ],
    );
    const kept = (yield* svc.items.loadLinks(item.id))[1]!;

    yield* svc.items.edit(
      item.id,
      { ...repeatEdit("Audit", weekly), title: "Audit (final)", statusId: completedStatusId },
      [
        { fieldDefinitionId: removed.id },
        { fieldDefinitionId: edited.id, textValue: "After" },
        { fieldDefinitionId: added.id, textValue: "New" },
      ],
      undefined,
      [
        { id: null, url: "https://example.com/add", title: "New" },
        { id: kept.id, url: kept.url, title: "After" },
      ],
    );

    const successor = yield* world.successorOf(item.id);
    expect(successor.Title).toBe("Audit (final)");
    const links = yield* svc.items.loadLinks(successor.Id);
    expect(links.map(({ url, title }) => ({ url, title }))).toEqual([
      { url: "https://example.com/add", title: "New" },
      { url: "https://example.com/keep", title: "After" },
    ]);
    const values = yield* svc.items.loadFieldValues(successor.Id);
    const byField = new Map(
      values.map(({ fieldDefinitionId, textValue }) => [fieldDefinitionId, textValue]),
    );
    expect(byField).toEqual(
      new Map([
        [edited.id, "After"],
        [added.id, "New"],
      ]),
    );
    expect((yield* world.undo.status()).undo).toBe("Set status of 'Audit (final)'");

    yield* world.undo.apply("undo");

    expect(yield* world.exists(successor.Id)).toBe(false);
    const restored = yield* svc.items.loadFieldValues(item.id);
    expect(new Set(restored.map(({ textValue }) => textValue))).toEqual(new Set(["Before", "Old"]));
  }));

test("A Done status kept off by a new sub-item occurrence is not assigned", (svc, world) =>
  Effect.gen(function* () {
    const parent = yield* world.create("Release");
    const child = yield* world.create("Check", parent.id);
    yield* world.repeat(child.id, "Check", weekly);
    yield* svc.items.setStatus(parent.id, testingStatusId);

    const result = yield* svc.items.setStatus(parent.id, completedStatusId, [child.id]);

    expect(result).toMatchObject({
      kind: "applied",
      parentKeptOpenMessage: "A new occurrence of a sub-item keeps 'Release' open.",
    });
    expect(yield* world.read(parent.id)).toMatchObject({
      StatusId: testingStatusId,
      CompletedAtUtc: null,
    });
    expect(
      (yield* world.children(parent.id)).filter((row) => row.CompletedAtUtc === null),
    ).toHaveLength(1);
  }));

test("Setting, changing and removing a rule are labelled undo steps", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");
    const labels: Array<string | null> = [];

    yield* world.repeat(item.id, "Audit", weekly);
    labels.push((yield* world.undo.status()).undo);
    yield* world.repeat(item.id, "Audit", recurrenceRule("Daily"));
    labels.push((yield* world.undo.status()).undo);
    yield* svc.items.edit(item.id, repeatEdit("Renamed", recurrenceRule("Daily")), []);
    labels.push((yield* world.undo.status()).undo);
    yield* world.repeat(item.id, "Renamed", null);
    labels.push((yield* world.undo.status()).undo);

    expect(labels).toEqual([
      "Set repeat for 'Audit'",
      "Set repeat for 'Audit'",
      "Edit 'Renamed'",
      "Stop repeating 'Renamed'",
    ]);
  }));

test("A rule without a due date or scheduled start saves nothing", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Audit");

    const failure = yield* Effect.flip(
      svc.items.edit(item.id, editFields("Changed", { recurrence: weekly }), []),
    );

    expect(failure).toEqual(
      new MetadataRuleError("A repeating item needs a due date or a scheduled start."),
    );
    expect((yield* world.read(item.id)).Title).toBe("Audit");
  }));

test("An edited rule keeps the series and the successor marker", (_svc, world) =>
  Effect.gen(function* () {
    const item = yield* createTwoOccurrenceSeries(world);
    yield* world.complete(item.id);
    yield* world.complete(item.id, false);
    const before = yield* world.read(item.id);

    yield* world.repeat(item.id, "Audit", weekly);

    expect(yield* world.read(item.id)).toMatchObject({
      RecurrenceSeriesId: before.RecurrenceSeriesId,
      RecurrenceSuccessorCreated: 1,
      RecurrenceFrequency: 2,
    });
    yield* world.complete(item.id);
    expect(yield* world.roots).toHaveLength(2);
  }));
