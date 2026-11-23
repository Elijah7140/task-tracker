import type { Item } from "@task-tracker/contracts";
import { describeRepeat, isoWeekday, type RepeatRule } from "../format/recurrence-summary.js";
import type { BuiltInTexts } from "./item-draft.js";

type ItemRecord = typeof Item.Type;

/** The frequency dropdown's values, including "Does not repeat". */
export type RepeatFrequency = "None" | RepeatRule["frequency"];

/** What the Repeat section's controls show, in their own string forms (§7.11). */
export interface RepeatDraft {
  readonly frequency: RepeatFrequency;
  readonly interval: string;
  /** Monday-first weekday bit flags. */
  readonly weekdays: number;
  readonly monthDay: string;
  readonly lastDay: boolean;
  readonly anchor: RepeatRule["anchor"];
  readonly endKind: RepeatRule["endKind"];
  /** The last allowed occurrence date, YYYY-MM-DD, or "". */
  readonly endDate: string;
  readonly count: string;
}

/** Whether the Repeat section can be saved and what saving it sends. */
export interface RepeatDraftStatus {
  /** The rule to save; undefined leaves the stored rule alone. */
  readonly recurrence: RepeatRule | null | undefined;
  /** True when the draft would replace the stored rule. */
  readonly changed: boolean;
  /** Why the shown rule cannot be saved, in the server's words where they match. */
  readonly error: string | null;
  /** The shown rule in plain English, or null when it does not repeat or has an error. */
  readonly summary: string | null;
}

/** Shown when a rule has no date to advance, as the server says it. */
export const REPEAT_DATE_REQUIRED = "A repeating item needs a due date.";

/** The date a rule advances: the due date. */
export function repeatDate(dates: Pick<BuiltInTexts, "dueDate">): string | null {
  return dates.dueDate || null;
}

function storedRepeatDate(item: ItemRecord): string | null {
  return item.dueDate;
}

/** The draft that shows the stored rule, or a weekly-ready draft seeded from the item's date. */
export function storedRepeatDraft(item: ItemRecord): RepeatDraft {
  const rule = item.recurrence ?? null;
  const date = storedRepeatDate(item);
  const dateDay = date === null ? 1 : Number(date.slice(8, 10));
  return {
    frequency: rule?.frequency ?? "None",
    interval: String(rule?.interval ?? 1),
    weekdays: rule?.weekdays ?? 1 << ((date === null ? 1 : isoWeekday(date)) - 1),
    monthDay: String(rule !== null && (rule.monthDay ?? 0) > 0 ? rule.monthDay : dateDay),
    lastDay: rule?.monthDay === 0,
    anchor: rule?.anchor ?? "DueDate",
    endKind: rule?.endKind ?? "Never",
    endDate: rule?.endDate ?? "",
    count: String(rule?.remaining ?? 1),
  };
}

const wholeNumber = (text: string) => (/^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN);

/** A yearly rule keeps its saved month and day until the date it came from changes. */
function yearDay(item: ItemRecord, date: string): Pick<RepeatRule, "month" | "monthDay"> {
  const saved = item.recurrence ?? null;
  if (saved?.frequency === "Yearly" && date === storedRepeatDate(item)) {
    return { month: saved.month, monthDay: saved.monthDay };
  }
  return { month: Number(date.slice(5, 7)), monthDay: Number(date.slice(8, 10)) };
}

function monthAndDay(item: ItemRecord, draft: RepeatDraft, date: string) {
  if (draft.frequency === "Monthly") {
    return { month: null, monthDay: draft.lastDay ? 0 : wholeNumber(draft.monthDay) };
  }
  return draft.frequency === "Yearly" ? yearDay(item, date) : { month: null, monthDay: null };
}

function buildRule(item: ItemRecord, draft: RepeatDraft, date: string): RepeatRule | null {
  if (draft.frequency === "None") {
    return null;
  }
  return {
    frequency: draft.frequency,
    interval: wholeNumber(draft.interval),
    weekdays: draft.frequency === "Weekly" ? draft.weekdays : null,
    ...monthAndDay(item, draft, date),
    anchor: draft.anchor,
    endKind: draft.endKind,
    endDate: draft.endKind === "OnDate" && draft.endDate !== "" ? draft.endDate : null,
    remaining: draft.endKind === "AfterCount" ? wholeNumber(draft.count) : null,
  };
}

function ruleError(rule: RepeatRule, draft: RepeatDraft): string | null {
  const monthDay = rule.monthDay ?? 0;
  if (rule.frequency === "Monthly" && !draft.lastDay && !(monthDay >= 1 && monthDay <= 31)) {
    return "Enter a day of the month from 1 to 31.";
  }
  if (!(rule.interval >= 1)) {
    return "Repeat interval must be positive.";
  }
  if (rule.frequency === "Weekly" && rule.weekdays === 0) {
    return "Choose at least one valid weekday for weekly repeats only.";
  }
  if (rule.endKind === "OnDate" && rule.endDate === null) {
    return "An end date is required only when the repeat ends on a date.";
  }
  if (rule.endKind === "AfterCount" && !((rule.remaining ?? 0) >= 1)) {
    return "A positive occurrence count is required only for a count limit.";
  }
  return null;
}

/** Whether two optional rules have the same values. */
export function sameRepeatRule(left: RepeatRule | null, right: RepeatRule | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  const keys = Object.keys(left) as Array<keyof RepeatRule>;
  return keys.every((key) => left[key] === right[key]);
}

/**
 * Compares the Repeat section with the stored rule. An untouched section saves
 * nothing but still reports a stored rule left without a date by the edited dates.
 */
export function repeatDraftStatus(
  item: ItemRecord,
  draft: RepeatDraft | null,
  date: string | null,
): RepeatDraftStatus {
  const stored = item.recurrence ?? null;
  if (draft === null) {
    const error = stored !== null && date === null ? REPEAT_DATE_REQUIRED : null;
    const summary = stored === null || error !== null ? null : describeRepeat(stored);
    return { recurrence: undefined, changed: false, error, summary };
  }
  const rule = buildRule(item, draft, date ?? "");
  const changed = !sameRepeatRule(rule, stored);
  const error =
    rule === null ? null : date === null ? REPEAT_DATE_REQUIRED : ruleError(rule, draft);
  return {
    recurrence: changed ? rule : undefined,
    changed,
    error,
    summary: rule === null || error !== null ? null : describeRepeat(rule),
  };
}
