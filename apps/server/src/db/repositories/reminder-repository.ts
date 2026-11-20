import { SettingsCatalogue } from "@task-tracker/core";
import { Effect, Schema } from "effect";
import { type SqlClient, SqlClient as Sql, SqlSchema, type Statement } from "effect/sql";
import { effectiveSettingSql, REMINDER_ELIGIBLE_SQL } from "../reminder-sql.js";
import { DateText, Guid, UtcTicks, UtcTimestamp } from "../storage-codecs.js";

/** The most reminders one due query returns. */
export const REMINDER_BATCH_SIZE = 100;

/** A due or delivered reminder with what the panel and a notification show. */
export const ReminderEntryRow = Schema.Struct({
  itemId: Guid,
  title: Schema.String,
  projectId: Guid,
  folderId: Schema.NullOr(Guid),
  projectName: Schema.String,
  instant: UtcTicks,
}).pipe(
  Schema.encodeKeys({
    itemId: "ItemId",
    title: "Title",
    projectId: "ProjectId",
    folderId: "FolderId",
    projectName: "ProjectName",
    instant: "InstantTicks",
  }),
);

/** One reminder's identity and the instant it is due at. */
export type ReminderEntry = typeof ReminderEntryRow.Type;

/** The stored delivery and snooze state of one item. */
const ReminderStateRow = Schema.Struct({
  deliveredFor: Schema.NullOr(UtcTicks),
  snoozedForUtc: Schema.NullOr(UtcTicks),
  snoozedUntilUtc: Schema.NullOr(UtcTicks),
}).pipe(
  Schema.encodeKeys({
    deliveredFor: "ReminderDeliveredFor",
    snoozedForUtc: "SnoozedForUtc",
    snoozedUntilUtc: "SnoozedUntilUtc",
  }),
);

/** The instants a due query compares, as of one moment in one zone. */
export interface ReminderWindow {
  readonly now: Temporal.Instant;
  readonly timeZone: string;
  /** Items due after this local date cannot remind yet and are skipped. */
  readonly horizon: Temporal.PlainDate;
}

/** Bounds for one page of due reminders. */
export interface DuePage {
  /** Only instants strictly before this one. */
  readonly before?: Temporal.Instant | undefined;
  /** Only instants at or after this one. */
  readonly since?: Temporal.Instant | undefined;
  readonly offset?: number | undefined;
}

const encodeTicks = Schema.encodeSync(UtcTicks);
const decodeEntries = Schema.decodeUnknownEffect(Schema.Array(ReminderEntryRow));
const decodeNext = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ Next: Schema.NullOr(UtcTicks) })),
);
const encodeDate = Schema.encodeSync(DateText);
const maxTicks = 3155378975999999999n;

/** Reads reminder instants through `tt_reminder_ticks` and writes delivery and snooze state. */
export function reminderRepository(sql: SqlClient.SqlClient) {
  const instants = (window: ReminderWindow, itemFilter: Statement.Fragment) => sql`
    WITH eligible AS MATERIALIZED (
      SELECT t.Id AS ItemId, t.Title, t.ProjectId, t.FolderId, p.Name AS ProjectName,
        t.ReminderDeliveredFor, t.SnoozedForUtc, t.SnoozedUntilUtc,
        tt_reminder_ticks(t.DueDate,
          COALESCE(t.DueTime, ${sql.literal(effectiveSettingSql(SettingsCatalogue.dateOnlyReminderTime))}),
          t.ReminderOffsetMinutes,
          ${sql.literal(effectiveSettingSql(SettingsCatalogue.defaultReminderOffset))},
          ${window.timeZone}) AS BaseTicks
      FROM TodoItem t
      JOIN Project p ON p.Id = t.ProjectId AND p.DeletedAtUtc IS NULL
      WHERE t.DeletedAtUtc IS NULL AND t.DueDate <= ${encodeDate(window.horizon)}
        AND ${sql.literal(REMINDER_ELIGIBLE_SQL)} AND ${itemFilter}
        AND (t.FolderId IS NULL OR EXISTS (
          SELECT 1 FROM Folder f WHERE f.Id = t.FolderId AND f.DeletedAtUtc IS NULL))
    ), reminders AS (
      SELECT ItemId, Title, ProjectId, FolderId, ProjectName, ReminderDeliveredFor,
        CASE WHEN SnoozedForUtc = BaseTicks THEN COALESCE(SnoozedUntilUtc, BaseTicks)
          ELSE BaseTicks END AS InstantTicks
      FROM eligible WHERE BaseTicks IS NOT NULL
    )`;

  const due = (window: ReminderWindow, page: DuePage) => sql`
      ${instants(window, sql`1 = 1`)}
      SELECT ItemId, Title, ProjectId, FolderId, ProjectName, InstantTicks FROM reminders
      WHERE InstantTicks <= ${encodeTicks(window.now)}
        AND InstantTicks < ${page.before === undefined ? maxTicks : encodeTicks(page.before)}
        AND InstantTicks >= ${page.since === undefined ? 0n : encodeTicks(page.since)}
        AND ReminderDeliveredFor IS NOT InstantTicks
      ORDER BY InstantTicks DESC, ItemId
      LIMIT ${REMINDER_BATCH_SIZE} OFFSET ${page.offset ?? 0}`;

  const delivered = (window: ReminderWindow, itemIds: readonly string[]) => sql`
      ${instants(window, sql.in("t.Id", itemIds))}
      SELECT ItemId, Title, ProjectId, FolderId, ProjectName, InstantTicks FROM reminders
      WHERE InstantTicks <= ${encodeTicks(window.now)} AND ReminderDeliveredFor = InstantTicks
      ORDER BY InstantTicks DESC, ItemId`;

  const nextInstant = (window: ReminderWindow) => sql`
      ${instants(window, sql`1 = 1`)}
      SELECT MIN(InstantTicks) AS Next FROM reminders
      WHERE InstantTicks > ${encodeTicks(window.now)} AND ReminderDeliveredFor IS NOT InstantTicks`;

  const storedDefaults = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ Value: Schema.String }),
    execute: () => {
      const key = SettingsCatalogue.defaultReminderOffset.key;
      return sql`SELECT Value FROM GlobalSetting WHERE Key = ${key}
        UNION ALL SELECT Value FROM ProjectSetting WHERE Key = ${key}`;
    },
  });

  const state = SqlSchema.findOneOption({
    Request: Guid,
    Result: ReminderStateRow,
    execute: (id) => sql`SELECT ReminderDeliveredFor, SnoozedForUtc, SnoozedUntilUtc
      FROM TodoItem WHERE Id = ${id}`,
  });

  const decode = <E, R>(rows: Effect.Effect<ReadonlyArray<object>, E, R>) =>
    rows.pipe(Effect.flatMap(decodeEntries), Effect.provideService(Sql.SafeIntegers, true));
  const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, Sql.SafeIntegers, true);

  return {
    /** One page of due reminders, newest instant first. */
    due: (window: ReminderWindow, page: DuePage = {}) => decode(due(window, page)),
    /** The given items whose current instant has been delivered and not yet changed. */
    delivered: (window: ReminderWindow, itemIds: readonly string[]) =>
      itemIds.length === 0 ? Effect.succeed([]) : decode(delivered(window, itemIds)),
    /** The earliest undelivered instant after the window's moment, within its horizon. */
    nextInstant: (window: ReminderWindow) =>
      safe(nextInstant(window).pipe(Effect.flatMap(decodeNext))).pipe(
        Effect.map(([row]) => row?.Next ?? null),
      ),
    /** Every stored default offset text, global and project. */
    storedDefaultOffsets: () =>
      storedDefaults(undefined).pipe(Effect.map((rows) => rows.map((row) => row.Value))),
    /** An item's delivery and snooze instants. */
    state: (itemId: string) => safe(state(itemId)),
    /** Records the instant last delivered. Operational state, never history (§7.8). */
    recordDelivery: SqlSchema.void({
      Request: Schema.Struct({ itemId: Guid, instant: UtcTicks }),
      execute: ({ itemId, instant }) =>
        sql`UPDATE TodoItem SET ReminderDeliveredFor = ${instant} WHERE Id = ${itemId}`,
    }),
    /** Defers the base instant `snoozedForUtc` to `snoozedUntilUtc`. */
    snooze: SqlSchema.void({
      Request: Schema.Struct({
        itemId: Guid,
        snoozedForUtc: UtcTicks,
        snoozedUntilUtc: UtcTicks,
        now: UtcTimestamp,
      }),
      execute: ({ itemId, snoozedForUtc, snoozedUntilUtc, now }) =>
        sql`UPDATE TodoItem SET SnoozedForUtc = ${snoozedForUtc},
          SnoozedUntilUtc = ${snoozedUntilUtc}, UpdatedAtUtc = ${now} WHERE Id = ${itemId}`,
    }),
  };
}
