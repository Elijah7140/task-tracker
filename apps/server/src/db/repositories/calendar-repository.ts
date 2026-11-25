import {
  DEFAULT_CALENDAR_THRESHOLDS,
  priorityLabel,
  type CalendarEntry,
  type CalendarQuery,
} from "@task-tracker/core";
import { Effect, Schema } from "effect";
import { type SqlClient, SqlSchema } from "effect/sql";
import { activeRow } from "../active-row.js";
import { DateText, Guid, TimeText, UtcTimestamp } from "../storage-codecs.js";

const CalendarCandidateRow = Schema.Struct({
  id: Guid,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  title: Schema.String,
  priorityLevelId: Schema.NullOr(Guid),
  statusId: Schema.NullOr(Guid),
  dueDate: DateText,
  dueTime: Schema.NullOr(TimeText),
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

interface LookupNames {
  readonly priorities: ReadonlyMap<string, string>;
  readonly statuses: ReadonlyMap<string, string>;
}

/** The due entry of an item whose due date the query matched. */
function createEntry(item: Candidate, lookups: LookupNames): CalendarEntry {
  return {
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    title: item.title,
    date: item.dueDate,
    startTime: item.dueTime,
    isCompleted: item.completedAtUtc !== null,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    priority:
      item.priorityLevelId === null ? null : (lookups.priorities.get(item.priorityLevelId) ?? null),
    statusId: item.statusId,
    statusName: item.statusId === null ? null : (lookups.statuses.get(item.statusId) ?? null),
    priorityLevelId: item.priorityLevelId,
    thresholds: DEFAULT_CALENDAR_THRESHOLDS,
  };
}

const CandidateRequest = Schema.Struct({
  projectId: Schema.NullOr(Guid),
  fromDate: Schema.String,
  toDateExclusive: Schema.String,
  includeCompleted: Schema.Boolean,
});

type CandidateBounds = typeof CandidateRequest.Type;

/** Stored text bounds for a query. */
function candidateBounds(query: CalendarQuery): CandidateBounds {
  return {
    projectId: query.projectId,
    fromDate: query.fromDate.toString(),
    toDateExclusive: query.toDateExclusive.toString(),
    includeCompleted: query.includeCompleted,
  };
}

const candidateColumns = (sql: SqlClient.SqlClient) => sql`
  i.Id AS id,
  i.ProjectId AS projectId,
  i.FolderId AS folderId,
  i.Title AS title,
  i.PriorityLevelId AS priorityLevelId,
  i.StatusId AS statusId,
  i.DueDate AS dueDate,
  i.DueTime AS dueTime,
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

const candidateQuery = (sql: SqlClient.SqlClient, bounds: CandidateBounds) => sql`
  SELECT ${candidateColumns(sql)}
  FROM TodoItem i
  WHERE ${inActiveLocation(sql)}
    AND ${inScope(sql, bounds.projectId)}
    AND ${matchesCompletion(sql, bounds.includeCompleted)}
    AND ${dueInRange(sql, bounds)}`;

/** Queries active items due in a calendar range and resolves active item locations. */
export function calendarRepository(sql: SqlClient.SqlClient) {
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
    const [candidates, priorityRows, statusRows] = yield* Effect.all([
      selectCandidates(candidateBounds(query)),
      selectPriorities(),
      selectStatuses(),
    ]);
    const lookups: LookupNames = {
      priorities: new Map(
        priorityRows.map((row) => [row.id, priorityLabel({ name: row.name, number: row.number })]),
      ),
      statuses: new Map(statusRows.map((row) => [row.id, row.name])),
    };
    return candidates.map((item) => createEntry(item, lookups));
  });

  return {
    load,
    locateItem: (itemId: string) => selectLocation(itemId),
  };
}
