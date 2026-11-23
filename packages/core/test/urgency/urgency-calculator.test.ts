import { expect, it } from "@effect/vitest";
import {
  calculateDisplayedNodeUrgency,
  calculateDisplayedUrgency,
  calculateUrgency,
  ItemTree,
  UrgencyThresholds,
  type TodoItem,
} from "../../src/index.js";
import { earlier, item, now, projectId } from "../fixtures.js";

const zone = "UTC";
const hour = 36_000_000_000n;
const day = 24n * hour;

function local(offset: Temporal.DurationLike): Temporal.PlainDateTime {
  return now.add(offset).toZonedDateTimeISO(zone).toPlainDateTime();
}

/** A due date and time `offset` from now. */
function dueIn(offset: Temporal.DurationLike) {
  const at = local(offset);
  return { dueDate: at.toPlainDate(), dueTime: at.toPlainTime() };
}

function tree(...rows: TodoItem[]) {
  return new ItemTree(projectId, null, rows);
}

it("classifies exact threshold and deadline boundaries", () => {
  const task = item("task");
  const thresholds = new UrgencyThresholds(3n * day, day);

  const yellow = calculateUrgency(
    { ...task, ...dueIn({ hours: 72 }) },
    now,
    zone,
    thresholds,
  );
  const red = calculateUrgency(
    { ...task, ...dueIn({ hours: 24 }) },
    now,
    zone,
    thresholds,
  );
  const atDeadline = calculateUrgency(
    { ...task, ...dueIn({ seconds: 0 }) },
    now,
    zone,
    thresholds,
  );
  const overdue = calculateUrgency(
    { ...task, ...dueIn({ nanoseconds: -100 }) },
    now,
    zone,
    thresholds,
  );

  expect(yellow).toBe("Approaching");
  expect(red).toBe("Imminent");
  expect(atDeadline).toBe("Imminent");
  expect(overdue).toBe("Overdue");
});

it("gives a completed item no urgency even with an overdue deadline", () => {
  const task = item("task", { ...dueIn({ hours: -24 }), completedAtUtc: now });

  const actual = calculateUrgency(task, now, zone, new UrgencyThresholds(3n * day, day));

  expect(actual).toBe("None");
});

it("gives an item without a due date no urgency", () => {
  const task = item("task");

  const actual = calculateUrgency(task, now, zone, new UrgencyThresholds(3n * day, day));

  expect(actual).toBe("None");
});

it("uses a later deadline for a date-only due date than a timed due date on the same day", () => {
  const dueDate = local({ seconds: 0 }).toPlainDate();
  const dateOnly = item("date-only", { dueDate });
  const timed = item("timed", { dueDate, dueTime: Temporal.PlainTime.from("11:00") });
  const thresholds = new UrgencyThresholds(3n * day, day);

  const dateOnlyUrgency = calculateUrgency(dateOnly, now, zone, thresholds);
  const timedUrgency = calculateUrgency(timed, now, zone, thresholds);

  expect(dateOnlyUrgency).toBe("Imminent");
  expect(timedUrgency).toBe("Overdue");
});

it("attributes the most urgent open branch to its item", () => {
  const items = tree(
    item("root", { ...dueIn({ hours: 48 }) }),
    item("yellow", { parentItemId: "root", ...dueIn({ hours: 48 }) }),
    item("red", { parentItemId: "root", ...dueIn({ hours: 2 }) }),
  );

  const actual = calculateDisplayedUrgency(
    items,
    "root",
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual).toEqual({ value: "Imminent", sourceDescendantId: "red" });
});

it("keeps the parent's own urgency on ties", () => {
  const items = tree(
    item("root", { ...dueIn({ hours: 2 }) }),
    item("child", { parentItemId: "root", ...dueIn({ hours: 1 }) }),
  );

  const actual = calculateDisplayedUrgency(
    items,
    "root",
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual).toEqual({ value: "Imminent", sourceDescendantId: null });
});

it("includes an open descendant of a completed parent", () => {
  const items = tree(
    item("root", { completedAtUtc: now }),
    item("child", { parentItemId: "root", ...dueIn({ hours: 2 }) }),
  );

  const actual = calculateDisplayedUrgency(
    items,
    "root",
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual).toEqual({ value: "Imminent", sourceDescendantId: "child" });
});

it("excludes deleted descendants from urgency", () => {
  const items = tree(
    item("root"),
    item("child", {
      parentItemId: "root",
      ...dueIn({ hours: -1 }),
      deletedAtUtc: earlier,
      deletionBatchId: "batch",
    }),
  );

  const actual = calculateDisplayedUrgency(
    items,
    "root",
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual.value).toBe("None");
});

it("clamps the yellow band to red when red is larger", () => {
  const thresholds = new UrgencyThresholds(hour, day);
  const task = item("task", { ...dueIn({ hours: 20 }) });

  const actual = calculateUrgency(task, now, zone, thresholds);

  expect(thresholds.yellow).toBe(day);
  expect(actual).toBe("Imminent");
});

it("rolls up a loaded node's urgency and names its descendant", () => {
  const parent = {
    item: item("parent"),
    children: [
      {
        item: item("child", { parentItemId: "parent", ...dueIn({ hours: -1 }) }),
        children: [],
      },
    ],
  };

  const actual = calculateDisplayedNodeUrgency(
    parent,
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual).toEqual({ value: "Overdue", sourceDescendantId: "child" });
});

it("attributes rolled-up urgency to the open child among finished items", () => {
  const items = tree(
    item("open-root"),
    item("finished-root", { completedAtUtc: now }),
    item("open-child", {
      parentItemId: "open-root",
      dueDate: Temporal.PlainDate.from("2026-11-12"),
    }),
    item("finished-child", { parentItemId: "open-root", completedAtUtc: now }),
  );
  const thresholds = new UrgencyThresholds(3n * day, day);

  const openRoot = calculateDisplayedUrgency(items, "open-root", now, zone, thresholds);
  const finishedRoot = calculateDisplayedUrgency(items, "finished-root", now, zone, thresholds);
  const finishedChild = calculateDisplayedUrgency(items, "finished-child", now, zone, thresholds);

  expect(openRoot).toEqual({ value: "Overdue", sourceDescendantId: "open-child" });
  expect(finishedRoot).toEqual({ value: "None", sourceDescendantId: null });
  expect(finishedChild).toEqual({ value: "None", sourceDescendantId: null });
});

it("reports overdue urgency from the loaded active child with a date-only deadline", () => {
  const parent = {
    item: item("parent"),
    children: [
      {
        item: item("child", {
          parentItemId: "parent",
          dueDate: Temporal.PlainDate.from("2026-11-12"),
        }),
        children: [],
      },
    ],
  };

  const actual = calculateDisplayedNodeUrgency(
    parent,
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual).toEqual({ value: "Overdue", sourceDescendantId: "child" });
});

it("names the first most urgent descendant in sibling order", () => {
  const items = tree(
    item("root"),
    item("later-sibling", {
      parentItemId: "root",
      sortOrder: 1,
      ...dueIn({ hours: -2 }),
    }),
    item("first-sibling", { parentItemId: "root", sortOrder: 0 }),
    item("grandchild", { parentItemId: "first-sibling", ...dueIn({ hours: -1 }) }),
  );

  const actual = calculateDisplayedUrgency(
    items,
    "root",
    now,
    zone,
    new UrgencyThresholds(3n * day, day),
  );

  expect(actual).toEqual({ value: "Overdue", sourceDescendantId: "grandchild" });
});
