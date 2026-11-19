import {
  DEFAULT_CALENDAR_BLOCK_MINUTES,
  DEFAULT_CALENDAR_THRESHOLDS,
  effectiveScheduledEnd,
  priorityLabel,
  type CalendarEntry,
  type CalendarQuery,
} from "@task-tracker/core";
import { Effect, Schema } from "effect";
import { type SqlClient, SqlSchema } from "effect/sql";
import { activeRow } from "../active-row.js";
import { DateText, FloatingTimestamp, Guid, TimeText, UtcTimestamp } from "../storage-codecs.js";

const CalendarCandidateRow = Schema.Struct({
  id: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  itemTypeId: Schema.NullOr(Guid),
  priorityLevelId: Schema.NullOr(Guid),
  statusId: Schema.NullOr(Guid),
  dueDate: Schema.NullOr(DateText),
  dueTime: Schema.NullOr(TimeText),
  scheduledStart: Schema.NullOr(FloatingTimestamp),
  scheduledEnd: Schema.NullOr(FloatingTimestamp),
  completedAtUtc: Schema.NullOr(UtcTimestamp),
});

const NamedRow = Schema.Struct({ id: Guid, name: Schema.String });
const PriorityRow = Schema.Struct({
  id: Guid,
  name: Schema.String,
  number: Schema.NullOr(Schema.Int),
});
const LocationRow = Schema.Struct({
  itemId: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
});

type Candidate = typeof CalendarCandidateRow.Type;

function formatBoundary(dateTime: Temporal.PlainDateTime): string {
  return dateTime.toString({ smallestUnit: "second" }).replace("T", " ");
}

function dueDateIsInRange(dueDate: Temporal.PlainDate, query: CalendarQuery): boolean {
  return (
    Temporal.PlainDate.compare(dueDate, query.fromDate) >= 0 &&
    Temporal.PlainDate.compare(dueDate, query.toDateExclusive) < 0
  );
}

function scheduleOverlapsRange(
  scheduledStart: Temporal.PlainDateTime,
  scheduledEnd: Temporal.PlainDateTime | null,
  query: CalendarQuery,
): boolean {
  const rangeStart = query.fromDate.toPlainDateTime("00:00:00");
  const rangeEnd = query.toDateExclusive.toPlainDateTime("00:00:00");
  const effectiveEnd = effectiveScheduledEnd(scheduledStart, scheduledEnd);
  return (
    effectiveEnd !== null &&
    Temporal.PlainDateTime.compare(scheduledStart, rangeEnd) < 0 &&
    Temporal.PlainDateTime.compare(effectiveEnd, rangeStart) > 0
  );
}

interface LookupNames {
  readonly types: ReadonlyMap<string, string>;
  readonly priorities: ReadonlyMap<string, string>;
  readonly statuses: ReadonlyMap<string, string>;
}

function createEntry(
  item: Candidate,
  kind: CalendarEntry["kind"],
  date: Temporal.PlainDate,
  startTime: Temporal.PlainTime | null,
  lookups: LookupNames,
): CalendarEntry {
  return {
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    title: item.title,
    kind,
    date,
    startTime,
    scheduledStart: item.scheduledStart,
    scheduledEnd: item.scheduledEnd,
    isCompleted: item.completedAtUtc !== null,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    itemType: item.itemTypeId === null ? null : (lookups.types.get(item.itemTypeId) ?? null),
    priority:
      item.priorityLevelId === null ? null : (lookups.priorities.get(item.priorityLevelId) ?? null),
    statusId: item.statusId,
    statusName: item.statusId === null ? null : (lookups.statuses.get(item.statusId) ?? null),
    priorityLevelId: item.priorityLevelId,
    thresholds: DEFAULT_CALENDAR_THRESHOLDS,
  };
}

function entriesFromItem(
  item: Candidate,
  query: CalendarQuery,
  lookups: LookupNames,
): ReadonlyArray<CalendarEntry> {
  const result: Array<CalendarEntry> = [];
  if (item.dueDate !== null && dueDateIsInRange(item.dueDate, query)) {
    result.push(createEntry(item, "due", item.dueDate, item.dueTime, lookups));
  }
  if (
    item.scheduledStart !== null &&
    scheduleOverlapsRange(item.scheduledStart, item.scheduledEnd, query)
  ) {
    result.push(
      createEntry(
        item,
        "scheduled",
        item.scheduledStart.toPlainDate(),
        item.scheduledStart.toPlainTime(),
        lookups,
      ),
    );
  }
  return result;
}

const CandidateRequest = Schema.Struct({
  projectId: Schema.NullOr(Guid),
  fromDate: Schema.String,
  toDateExclusive: Schema.String,
  rangeStart: Schema.String,
  rangeEnd: Schema.String,
  earliestDefaultStart: Schema.String,
  includeCompleted: Schema.Boolean,
});

type CandidateBounds = typeof CandidateRequest.Type;

/** Stored text bounds for a query. Untimed blocks starting this early can still reach the range. */
function candidateBounds(query: CalendarQuery): CandidateBounds {
  const rangeStart = query.fromDate.toPlainDateTime("00:00:00");
  const rangeEnd = query.toDateExclusive.toPlainDateTime("00:00:00");
  const earliestDefaultStart = rangeStart.subtract({ minutes: DEFAULT_CALENDAR_BLOCK_MINUTES });
  return {
    projectId: query.projectId,
    fromDate: query.fromDate.toString(),
    toDateExclusive: query.toDateExclusive.toString(),
    rangeStart: formatBoundary(rangeStart),
    rangeEnd: formatBoundary(rangeEnd),
    earliestDefaultStart: formatBoundary(earliestDefaultStart),
    includeCompleted: query.includeCompleted,
  };
}

const candidateColumns = (sql: SqlClient.SqlClient) => sql`
  i.Id AS id,
  i.ProjectId AS projectId,
  i.FolderId AS folderId,
  i.Title AS title,
  i.ItemTypeId AS itemTypeId,
  i.PriorityLevelId AS priorityLevelId,
  i.StatusId AS statusId,
  i.DueDate AS dueDate,
  i.DueTime AS dueTime,
  i.ScheduledStart AS scheduledStart,
  i.ScheduledEnd AS scheduledEnd,
  i.CompletedAtUtc AS completedAtUtc`;

/** The item `i` is active and so are its project and any folder. */
const inActiveLocation = (sql: SqlClient.SqlClient) => sql`${activeRow(sql, "i")}
  AND EXISTS (SELECT 1 FROM Project p WHERE p.Id = i.ProjectId AND ${activeRow(sql, "p")})
  AND (i.FolderId IS NULL OR EXISTS (SELECT 1 FROM Folder f WHERE f.Id = i.FolderId AND ${activeRow(sql, "f")}))`;

const inScope = (sql: SqlClient.SqlClient, projectId: string | null) =>
  projectId === null ? sql`1 = 1` : sql`i.ProjectId = ${projectId}`;

const matchesCompletion = (sql: SqlClient.SqlClient, includeCompleted: boolean) =>
  includeCompleted ? sql`1 = 1` : sql`i.CompletedAtUtc IS NULL`;

const dueInRange = (sql: SqlClient.SqlClient, bounds: CandidateBounds) =>
  sql`(i.DueDate >= ${bounds.fromDate} AND i.DueDate < ${bounds.toDateExclusive})`;

/** A block with a later end overlaps when it starts before the range end and ends after its start. */
const timedBlockOverlaps = (sql: SqlClient.SqlClient, bounds: CandidateBounds) => sql`(
  i.ScheduledStart < ${bounds.rangeEnd}
  AND i.ScheduledEnd IS NOT NULL
  AND i.ScheduledEnd > i.ScheduledStart
  AND i.ScheduledEnd > ${bounds.rangeStart})`;

/** A block without a later end lasts the default length, so it may start before the range. */
const defaultBlockOverlaps = (sql: SqlClient.SqlClient, bounds: CandidateBounds) => sql`(
  i.ScheduledStart >= ${bounds.earliestDefaultStart}
  AND i.ScheduledStart < ${bounds.rangeEnd}
  AND (i.ScheduledEnd IS NULL OR i.ScheduledEnd <= i.ScheduledStart))`;

/** A coarse SQL prefilter. `entriesFromItem` applies the exact per-entry range rules. */
const touchesRange = (sql: SqlClient.SqlClient, bounds: CandidateBounds) =>
  sql`(${dueInRange(sql, bounds)} OR ${timedBlockOverlaps(sql, bounds)} OR ${defaultBlockOverlaps(sql, bounds)})`;

const candidateQuery = (sql: SqlClient.SqlClient, bounds: CandidateBounds) => sql`
  SELECT ${candidateColumns(sql)}
  FROM TodoItem i
  WHERE ${inActiveLocation(sql)}
    AND ${inScope(sql, bounds.projectId)}
    AND ${matchesCompletion(sql, bounds.includeCompleted)}
    AND ${touchesRange(sql, bounds)}`;

/** Queries active items touching a calendar range and resolves active item locations. */
export function calendarRepository(sql: SqlClient.SqlClient) {
  const selectTypes = SqlSchema.findAll({
    Request: Schema.Void,
    Result: NamedRow,
    execute: () => sql`SELECT Id AS id, Name AS name FROM ItemType`,
  });

  const selectPriorities = SqlSchema.findAll({
    Request: Schema.Void,
    Result: PriorityRow,
    execute: () => sql`SELECT Id AS id, Name AS name, Number AS number FROM PriorityLevel`,
  });

  const selectStatuses = SqlSchema.findAll({
    Request: Schema.Void,
    Result: NamedRow,
    execute: () => sql`SELECT Id AS id, Name AS name FROM StatusLevel`,
  });

  const selectLocation = SqlSchema.findOneOption({
    Request: Guid,
    Result: LocationRow,
    execute: (itemId) => sql`
      SELECT i.Id AS itemId, i.ProjectId AS projectId, i.FolderId AS folderId
      FROM TodoItem i
      WHERE i.Id = ${itemId} AND ${inActiveLocation(sql)}
    `,
  });

  const selectCandidates = SqlSchema.findAll({
    Request: CandidateRequest,
    Result: CalendarCandidateRow,
    execute: (bounds) => candidateQuery(sql, bounds),
  });

  const load = Effect.fnUntraced(function* (query: CalendarQuery) {
    const [candidates, typeRows, priorityRows, statusRows] = yield* Effect.all([
      selectCandidates(candidateBounds(query)),
      selectTypes(),
      selectPriorities(),
      selectStatuses(),
    ]);
    const lookups: LookupNames = {
      types: new Map(typeRows.map((row) => [row.id, row.name])),
      priorities: new Map(
        priorityRows.map((row) => [row.id, priorityLabel({ name: row.name, number: row.number })]),
      ),
      statuses: new Map(statusRows.map((row) => [row.id, row.name])),
    };
    return candidates.flatMap((item) => entriesFromItem(item, query, lookups));
  });

  return {
    load,
    locateItem: (itemId: string) => selectLocation(itemId),
  };
}
