import type { CalendarEntry } from "@task-tracker/contracts";
import { addDays, formatDayHeader, formatDayName, parseIsoDate } from "./calendar-dates.js";
import {
  DAY_MINUTES,
  DUE_MARKER_MINUTES,
  MAX_VISIBLE_MONTH_ENTRIES,
  PIXELS_PER_MINUTE,
  TWO_LINE_HEIGHT,
} from "./calendar-metrics.js";

type Entry = typeof CalendarEntry.Type;

const TIME_PARTS = /^(\d{2}):(\d{2})(?::(\d{2}))?/;

/** An entry on its calendar day, with week-grid placement. */
export interface CalendarOccurrence {
  readonly entry: Entry;
  readonly day: string;
  readonly startMinutes: number | null;
  readonly isAllDay: boolean;
  readonly durationMinutes: number;
  readonly layoutStartMinutes: number;
  readonly layoutEndMinutes: number;
  readonly topPx: number;
  readonly heightPx: number;
  readonly isCompact: boolean;
  readonly widthFraction: number;
  readonly leftFraction: number;
  readonly label: string;
  readonly monthLabel: string;
  readonly tooltip: string;
  /** Title, timing on this day and urgency, so the entry is understood without colour. */
  readonly accessibleLabel: string;
}

/** One visible day cell or column and its ordered, laid-out occurrences. */
export interface CalendarDay {
  readonly date: string;
  readonly dayNumber: number;
  readonly label: string;
  /** The full date for screen readers, marked when it is today. */
  readonly accessibleName: string;
  readonly isOutsideMonth: boolean;
  readonly isToday: boolean;
  readonly entries: ReadonlyArray<CalendarOccurrence>;
  readonly visibleMonthEntries: ReadonlyArray<CalendarOccurrence>;
  readonly moreCount: number;
  readonly allDayEntries: ReadonlyArray<CalendarOccurrence>;
  readonly timedEntries: ReadonlyArray<CalendarOccurrence>;
}

function timeToMinutes(isoTime: string): number {
  const match = TIME_PARTS.exec(isoTime);
  if (match === null) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] ?? 0) / 60;
}

function formatHourMinute(minutes: number): string {
  const whole = Math.floor(minutes);
  const hour = Math.floor(whole / 60);
  const minute = whole % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function describeTiming(startMinutes: number | null): string {
  return startMinutes === null ? "due all day" : `due ${formatHourMinute(startMinutes)}`;
}

/** Week-grid geometry of a due marker; a late marker is moved up to end at midnight. */
function geometry(startMinutes: number | null) {
  const durationMinutes = DUE_MARKER_MINUTES;
  const layoutStartMinutes = Math.min(startMinutes ?? 0, DAY_MINUTES - durationMinutes);
  const heightPx = durationMinutes * PIXELS_PER_MINUTE;
  return {
    durationMinutes,
    layoutStartMinutes,
    layoutEndMinutes: layoutStartMinutes + durationMinutes,
    topPx: layoutStartMinutes * PIXELS_PER_MINUTE,
    heightPx,
    isCompact: heightPx < TWO_LINE_HEIGHT,
  };
}

/** Visible, tooltip and screen reader text for one occurrence. */
function labels(entry: Entry, startMinutes: number | null) {
  const label = entry.isCompleted ? `✓ ${entry.title}` : entry.title;
  const summary = entry.priority ?? "No priority";
  const urgency = entry.urgency === "None" ? [] : [entry.urgency];
  const timing = describeTiming(startMinutes);
  return {
    label,
    monthLabel: startMinutes === null ? label : `${formatHourMinute(startMinutes)} ${label}`,
    tooltip: entry.statusName === null ? summary : `${summary} · ${entry.statusName}`,
    accessibleLabel: [label, timing, ...urgency].join(", "),
  };
}

function buildOccurrence(entry: Entry, startMinutes: number | null): CalendarOccurrence {
  return {
    entry,
    day: entry.date,
    startMinutes,
    isAllDay: startMinutes === null,
    ...geometry(startMinutes),
    widthFraction: 1,
    leftFraction: 0,
    ...labels(entry, startMinutes),
  };
}

/** The entry's occurrence on `day`: a due entry appears only on its due date (§7.4). */
export function entryOnDay(entry: Entry, day: string): CalendarOccurrence | null {
  if (entry.date !== day) {
    return null;
  }
  return buildOccurrence(entry, entry.startTime === null ? null : timeToMinutes(entry.startTime));
}

/** A level's rank, 0 for the most important; an item with no priority sorts after every level. */
function priorityRank(entry: Entry, ranks: ReadonlyMap<string, number>): number {
  return entry.priorityLevelId === null
    ? Number.MAX_SAFE_INTEGER
    : (ranks.get(entry.priorityLevelId) ?? Number.MAX_SAFE_INTEGER);
}

function compareOccurrences(
  left: CalendarOccurrence,
  right: CalendarOccurrence,
  context: Pick<DayContext, "collator" | "priorityRanks">,
): number {
  const { collator, priorityRanks } = context;
  if (left.isAllDay !== right.isAllDay) {
    return left.isAllDay ? -1 : 1;
  }
  const byPriority =
    priorityRank(left.entry, priorityRanks) - priorityRank(right.entry, priorityRanks);
  if (byPriority !== 0) {
    return byPriority;
  }
  const leftStart = left.startMinutes ?? -1;
  const rightStart = right.startMinutes ?? -1;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }
  const byTitle = collator.compare(left.entry.title, right.entry.title);
  if (byTitle !== 0) {
    return byTitle;
  }
  if (left.entry.itemId === right.entry.itemId) {
    return 0;
  }
  // Uppercase GUID text sorts like .NET Guid comparison when compared ordinally.
  return left.entry.itemId < right.entry.itemId ? -1 : 1;
}

function placeOverlapGroup(
  group: ReadonlyArray<CalendarOccurrence>,
  placed: Map<CalendarOccurrence, { widthFraction: number; leftFraction: number }>,
) {
  if (group.length === 0) {
    return;
  }
  const columnEnds: Array<number> = [];
  const assignments: Array<number> = [];
  for (const occurrence of group) {
    let column = columnEnds.findIndex((end) => end <= occurrence.layoutStartMinutes);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = occurrence.layoutEndMinutes;
    assignments.push(column);
  }
  const widthFraction = 1 / columnEnds.length;
  group.forEach((occurrence, index) => {
    placed.set(occurrence, {
      widthFraction,
      leftFraction: assignments[index]! * widthFraction,
    });
  });
}

function splitOverlaps(occurrences: ReadonlyArray<CalendarOccurrence>): Array<CalendarOccurrence> {
  const timed = occurrences
    .filter((occurrence) => !occurrence.isAllDay)
    .toSorted((left, right) => left.layoutStartMinutes - right.layoutStartMinutes);
  const placed = new Map<CalendarOccurrence, { widthFraction: number; leftFraction: number }>();
  let group: Array<CalendarOccurrence> = [];
  let groupEnd = 0;

  for (const occurrence of timed) {
    if (group.length > 0 && occurrence.layoutStartMinutes >= groupEnd) {
      placeOverlapGroup(group, placed);
      group = [];
    }
    group.push(occurrence);
    groupEnd = Math.max(groupEnd, occurrence.layoutEndMinutes);
  }
  placeOverlapGroup(group, placed);

  return occurrences.map((occurrence) => {
    const geometry = placed.get(occurrence);
    return geometry === undefined ? occurrence : { ...occurrence, ...geometry };
  });
}

interface DayContext {
  readonly anchor: ReturnType<typeof parseIsoDate>;
  readonly today: string;
  readonly entries: ReadonlyArray<Entry>;
  readonly collator: Intl.Collator;
  readonly priorityRanks: ReadonlyMap<string, number>;
  readonly locale: string | undefined;
}

function dayName(date: string, context: DayContext): string {
  const name = formatDayName(date, context.locale);
  return date === context.today ? `${name}, today` : name;
}

function buildDay(date: string, context: DayContext): CalendarDay {
  const parts = parseIsoDate(date);
  const occurrences = context.entries
    .map((entry) => entryOnDay(entry, date))
    .filter((occurrence): occurrence is CalendarOccurrence => occurrence !== null)
    .toSorted((left, right) => compareOccurrences(left, right, context));
  const laidOut = splitOverlaps(occurrences);
  return {
    date,
    dayNumber: parts.day,
    label: formatDayHeader(date, context.locale),
    accessibleName: dayName(date, context),
    isOutsideMonth: parts.month !== context.anchor.month || parts.year !== context.anchor.year,
    isToday: date === context.today,
    entries: laidOut,
    visibleMonthEntries: laidOut.slice(0, MAX_VISIBLE_MONTH_ENTRIES),
    moreCount: Math.max(0, laidOut.length - MAX_VISIBLE_MONTH_ENTRIES),
    allDayEntries: laidOut.filter((occurrence) => occurrence.isAllDay),
    timedEntries: laidOut.filter((occurrence) => !occurrence.isAllDay),
  };
}

/**
 * Builds `count` consecutive calendar days starting at `fromDate`, placing and
 * ordering entries and laying out overlapping timed markers side by side. Days
 * outside `anchorMonth`'s month are marked for dimming. Within a day, all-day entries come first, then each group runs in priority
 * order (`priorityRanks`, most important first, no priority last), then by time.
 */
export function buildCalendarDays(
  fromDate: string,
  count: number,
  anchorMonth: string,
  today: string,
  entries: ReadonlyArray<Entry>,
  priorityRanks: ReadonlyMap<string, number> = new Map(),
  locale?: string,
): ReadonlyArray<CalendarDay> {
  const context: DayContext = {
    anchor: parseIsoDate(anchorMonth),
    today,
    entries,
    collator: new Intl.Collator(locale, { sensitivity: "accent" }),
    priorityRanks,
    locale,
  };
  return Array.from({ length: count }, (_, index) => buildDay(addDays(fromDate, index), context));
}
