import {
  compareInProgress,
  effectiveDeadline,
  priorityLabel,
  urgencyForDeadline,
  UrgencyThresholds,
  type Urgency,
} from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import {
  type InProgressItemRow,
  inProgressRepository,
} from "../db/repositories/in-progress-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { operationTime } from "./operation-time.js";

type Row = typeof InProgressItemRow.Type;

/** What the tray card shows about one in-progress item, with dates as ISO text (§7.18). */
export interface InProgressItemCard {
  readonly itemId: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly itemKind: "Todo" | "Ticket";
  readonly ticketNumber: string | null;
  readonly title: string;
  readonly areaPath: string;
  readonly statusName: string;
  readonly priorityName: string | null;
  readonly dueDate: string | null;
  readonly dueTime: string | null;
  readonly urgency: Urgency;
}

/** A loaded row with the sort facts worked out from its project's thresholds. */
interface RankedRow {
  readonly row: Row;
  readonly deadline: Temporal.Instant | null;
  readonly urgency: Urgency;
}

/** Culture-aware and case-insensitive, like the legacy project and breadcrumb ordering. */
const compareTitles = new Intl.Collator(undefined, { sensitivity: "accent" }).compare;

function toCard({ row, urgency }: RankedRow): InProgressItemCard {
  const priority =
    row.priorityName === null ? null : { name: row.priorityName, number: row.priorityNumber };
  return {
    itemId: row.itemId,
    projectId: row.projectId,
    folderId: row.folderId,
    itemKind: row.itemKind,
    ticketNumber: row.ticketNumber,
    title: row.title,
    areaPath: row.areaPath,
    statusName: row.statusName,
    priorityName: priority === null ? null : priorityLabel(priority),
    dueDate: row.dueDate?.toString() ?? null,
    dueTime: row.dueTime?.toString() ?? null,
    urgency,
  };
}

function compareRanked(left: RankedRow, right: RankedRow): number {
  const key = ({ row, deadline, urgency }: RankedRow) => ({
    urgency,
    deadline,
    priorityRank: row.priorityRank,
    title: row.title,
  });
  return compareInProgress(key(left), key(right), compareTitles);
}

const make = Effect.fnUntraced(function* (timeZone: string) {
  const sql = yield* SqlClient.SqlClient;
  const items = inProgressRepository(sql);
  const settings = settingsRepository(sql);

  /** Each project's urgency thresholds, which a project may override (§6.3). */
  const thresholdsFor = Effect.fnUntraced(function* (rows: readonly Row[]) {
    const globals = yield* settings.global();
    const thresholds = new Map<string, UrgencyThresholds>();
    for (const projectId of new Set(rows.map((row) => row.projectId))) {
      const effective = yield* readEffectiveSettings(settings, projectId, Effect.succeed(globals));
      const { urgencyYellowThreshold, urgencyRedThreshold } = effective;
      thresholds.set(
        projectId,
        new UrgencyThresholds(urgencyYellowThreshold.value, urgencyRedThreshold.value),
      );
    }
    return thresholds;
  });

  /** Reads the stack in one transaction, judging urgency at the operation's time. */
  const load = sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* items.list();
      const now = yield* operationTime;
      const thresholds = yield* thresholdsFor(rows);
      const rank = (row: Row): RankedRow => {
        const deadline = effectiveDeadline(row, timeZone);
        const urgency = urgencyForDeadline(deadline, now, thresholds.get(row.projectId)!);
        return { row, deadline, urgency };
      };
      return rows.map(rank).toSorted(compareRanked).map(toCard);
    }),
  );

  return { load };
});

/**
 * Lists the tray card's stack (§7.18): every open, available item whose status
 * is marked In progress, most urgent first, then by priority, deadline and
 * title. Urgency uses each project's thresholds, the server's zone and the
 * operation's time from Effect Clock.
 */
export class InProgressService extends Context.Service<InProgressService>()(
  "@task-tracker/server/InProgressService",
  { make },
) {
  static readonly layer = (timeZone: string) => Layer.effect(this, make(timeZone));
}
