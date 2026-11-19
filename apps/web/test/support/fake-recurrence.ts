import { type CompletionResult, NotFound, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";
import type { RepeatRule } from "../../src/format/recurrence-summary.js";
import { type FakeItemNode, recomputeAreaTree } from "./fake-area-items.js";
import type { FakeAreaState } from "./fake-item-operations.js";

type Result = typeof CompletionResult.Type;
type ItemRecord = FakeItemNode["item"];

/** The parts of the fake store the recurrence fake needs. */
export interface FakeRecurrenceStore {
  readonly nextId: () => string;
  readonly nextTimestamp: () => string;
  readonly allAreas: () => ReadonlyArray<FakeAreaState>;
}

const missingItem = () => new NotFound({ entity: "Item", message: "Item is missing or deleted." });

const DATE_REQUIRED = "A repeating item needs a due date or a scheduled start.";

// Calendar arithmetic on ISO dates by Howard Hinnant's civil algorithms, without a clock.
function daysFromCivil(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return (
    era * 146097 +
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear -
    719468
  );
}

function civilFromDays(days: number): string {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2) {
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function inMonth(year: number, month: number, day: number): string {
  const lastDay = daysInMonth(year, month);
  const chosen = day === 0 ? lastDay : Math.min(day, lastDay);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(chosen)}`;
}

function nextWeekday(date: string, interval: number, weekdays: number): string {
  const days = daysFromCivil(date);
  const index = (((days + 3) % 7) + 7) % 7;
  for (let next = index + 1; next < 7; next++) {
    if ((weekdays & (1 << next)) !== 0) {
      return civilFromDays(days + next - index);
    }
  }
  const first = [0, 1, 2, 3, 4, 5, 6].find((day) => (weekdays & (1 << day)) !== 0)!;
  return civilFromDays(days + 7 * interval + first - index);
}

function advance(rule: RepeatRule, date: string): string {
  const [year, month] = date.split("-").map(Number) as [number, number];
  switch (rule.frequency) {
    case "Daily":
      return civilFromDays(daysFromCivil(date) + rule.interval);
    case "Weekly":
      return nextWeekday(date, rule.interval, rule.weekdays ?? 1);
    case "Monthly": {
      const months = year * 12 + month - 1 + rule.interval;
      return inMonth(Math.floor(months / 12), (months % 12) + 1, rule.monthDay ?? 1);
    }
    case "Yearly":
      return inMonth(year + rule.interval, rule.month ?? 1, rule.monthDay ?? 1);
  }
}

/** The fake's next date from the due date; completion-date anchors use the due date too. */
function nextRepeatDate(rule: RepeatRule, date: string): string | null {
  if (rule.remaining === 1) {
    return null;
  }
  const next = advance(rule, date);
  return rule.endDate !== null && next > rule.endDate ? null : next;
}

const repeatDateOf = (item: ItemRecord) =>
  item.dueDate ?? item.scheduledStart?.slice(0, 10) ?? null;

function shiftDateTime(value: string | null, days: number): string | null {
  return value === null
    ? null
    : `${civilFromDays(daysFromCivil(value.slice(0, 10)) + days)}${value.slice(10)}`;
}

function shiftDates(item: ItemRecord, days: number): ItemRecord {
  return {
    ...item,
    dueDate: shiftDateTime(item.dueDate, days),
    scheduledStart: shiftDateTime(item.scheduledStart, days),
    scheduledEnd: shiftDateTime(item.scheduledEnd, days),
  };
}

const advanceRule = (rule: RepeatRule): RepeatRule =>
  rule.remaining === null ? rule : { ...rule, remaining: rule.remaining - 1 };

/**
 * Recurrence behind the fake server (§7.11): the editor's rule, Skip and Stop,
 * and next occurrences inserted after completed repeating items. It mirrors the
 * server's messages; the server's own tests cover the full rules.
 */
export class FakeRecurrence {
  /** Occurrences whose successor already exists, as the server's marker records. */
  readonly successors = new Set<string>();

  constructor(private readonly store: FakeRecurrenceStore) {}

  /** Validates an editor rule against the edit's dates and returns the write to run on success. */
  planEdit(
    itemId: string,
    dates: Pick<ItemRecord, "dueDate" | "scheduledStart">,
    recurrence: RepeatRule | null | undefined,
  ): Effect.Effect<() => void, RuleViolation> {
    const located = this.find(itemId);
    const rule = recurrence === undefined ? (located?.node.item.recurrence ?? null) : recurrence;
    if (rule !== null && repeatDateOf({ ...located!.node.item, ...dates }) === null) {
      return Effect.fail(new RuleViolation({ message: DATE_REQUIRED }));
    }
    if (recurrence === undefined) {
      return Effect.succeed(() => {});
    }
    return Effect.succeed(() =>
      this.update(itemId, (item) => ({
        ...item,
        recurrence,
        recurrenceSeriesId:
          recurrence === null ? null : (item.recurrenceSeriesId ?? this.store.nextId()),
      })),
    );
  }

  /** Adds next occurrences for repeating items the result completed, and flags an ended rule. */
  afterCompletion(result: Result): Result {
    if (result.kind !== "applied") {
      return result;
    }
    let lastRepeat = false;
    for (const change of result.changes) {
      if (change.completedAtUtc !== null) {
        lastRepeat = this.createSuccessor(change.itemId) || lastRepeat;
      }
    }
    return lastRepeat ? { ...result, lastRepeat } : result;
  }

  /** Moves an open occurrence to its next date; false when the rule has no next date. */
  skip(itemId: string): Effect.Effect<boolean, NotFound | RuleViolation> {
    const located = this.find(itemId);
    if (located === undefined) {
      return Effect.fail(missingItem());
    }
    const { item } = located.node;
    const rule = item.recurrence ?? null;
    const date = repeatDateOf(item);
    if (rule === null || item.completedAtUtc !== null || date === null) {
      return Effect.fail(
        new RuleViolation({ message: "Only an open repeating item can be skipped." }),
      );
    }
    const next = nextRepeatDate(rule, date);
    if (next === null) {
      return Effect.succeed(false);
    }
    const days = daysFromCivil(next) - daysFromCivil(date);
    this.update(itemId, (row) => ({ ...shiftDates(row, days), recurrence: advanceRule(rule) }));
    return Effect.succeed(true);
  }

  /** Removes the rule and series from one occurrence. */
  stop(itemId: string): Effect.Effect<void, NotFound> {
    if (this.find(itemId) === undefined) {
      return Effect.fail(missingItem());
    }
    this.update(itemId, (item) => ({ ...item, recurrence: null, recurrenceSeriesId: null }));
    return Effect.void;
  }

  /** The title of an active item, for history labels. */
  titleOf(itemId: string): string | undefined {
    return this.find(itemId)?.node.item.title;
  }

  private createSuccessor(itemId: string): boolean {
    const located = this.find(itemId);
    const item = located?.node.item;
    const rule = item?.recurrence ?? null;
    const date = item === undefined ? null : repeatDateOf(item);
    if (located === undefined || rule === null || date === null || this.successors.has(itemId)) {
      return false;
    }
    const next = nextRepeatDate(rule, date);
    if (next === null) {
      return true;
    }
    const days = daysFromCivil(next) - daysFromCivil(date);
    const copy = this.copyBranch(
      located.node,
      days,
      advanceRule(rule),
      item!.recurrenceSeriesId ?? null,
    );
    located.siblings.splice(located.index + 1, 0, copy);
    this.successors.add(itemId);
    located.area.nodes = recomputeAreaTree(located.area.nodes, located.area.baseUrgencies);
    return false;
  }

  private copyBranch(
    node: FakeItemNode,
    days: number,
    rule: RepeatRule | null,
    seriesId: string | null,
  ): FakeItemNode {
    const id = this.store.nextId();
    const now = this.store.nextTimestamp();
    const { item } = node;
    const open = item.completedAtUtc === null ? item.statusId : item.reopenStatusId;
    const children = node.children.map((child) =>
      this.copyBranch(child, days, child.item.recurrence ?? null, null),
    );
    return {
      ...node,
      item: {
        ...shiftDates(item, days),
        id,
        statusId: open,
        reopenStatusId: null,
        completedAtUtc: null,
        recurrence: rule,
        recurrenceSeriesId: rule === null ? null : (seriesId ?? this.store.nextId()),
        createdAtUtc: now,
        updatedAtUtc: now,
      },
      isFinished: false,
      // recomputeAreaTree assigns each copied child's parent and position.
      children,
    };
  }

  private update(itemId: string, change: (item: ItemRecord) => ItemRecord) {
    const located = this.find(itemId);
    if (located === undefined) {
      return;
    }
    const now = this.store.nextTimestamp();
    located.siblings[located.index] = {
      ...located.node,
      item: { ...change(located.node.item), updatedAtUtc: now },
    };
    located.area.nodes = recomputeAreaTree(located.area.nodes, located.area.baseUrgencies);
  }

  private find(itemId: string) {
    const key = itemId.toUpperCase();
    for (const area of this.store.allAreas()) {
      const located = locate(area.nodes, key);
      if (located !== undefined) {
        return { ...located, area };
      }
    }
    return undefined;
  }
}

function locate(
  nodes: Array<FakeItemNode>,
  itemId: string,
): { node: FakeItemNode; siblings: Array<FakeItemNode>; index: number } | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.item.id === itemId) {
      return { node, siblings: nodes, index };
    }
    const nested = locate(node.children as Array<FakeItemNode>, itemId);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}
