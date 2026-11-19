import { type CalendarEntry, NotFound, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";
import { isoDateToUtcMillis, parseIsoDate } from "../../src/calendar/calendar-dates.js";
import { DEFAULT_BLOCK_MINUTES } from "../../src/calendar/calendar-metrics.js";
import { FAKE_LOOKUPS, type FakeItemNode } from "./fake-area-items.js";
import type { FakeProjectStore } from "./fake-task-tracker-server.js";

type WireEntry = typeof CalendarEntry.Type;

const FLOATING_PARTS = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

function floatingToUtcMillis(isoDateTime: string): number {
  const match = FLOATING_PARTS.exec(isoDateTime);
  if (match === null) {
    return 0;
  }
  const { year, month, day } = parseIsoDate(match[1]!);
  return Date.UTC(year, month - 1, day, Number(match[2]), Number(match[3]), Number(match[4] ?? 0));
}

function collectNodes(nodes: ReadonlyArray<FakeItemNode>): Array<FakeItemNode> {
  const result: Array<FakeItemNode> = [];
  for (const node of nodes) {
    result.push(node, ...collectNodes(node.children));
  }
  return result;
}

/** In-memory calendar configuration for deterministic browser tests. */
export class FakeCalendar {
  /** Local date returned by `LoadCalendar` as the server's `today`. */
  today = "2026-11-16";
  /** Optional simulated load failure message for `LoadCalendar`. */
  loadFailure: string | null = null;
}

/** Fake RPC handlers for `LoadCalendar` and `LocateCalendarItem`. */
export function calendarHandlers(store: FakeProjectStore) {
  const typeNames = () =>
    new Map(
      [...FAKE_LOOKUPS.itemTypes, ...store.extraLookups.itemTypes].map((row) => [row.id, row.name]),
    );
  const priorityLabels = () =>
    new Map(
      [...FAKE_LOOKUPS.priorityLevels, ...store.extraLookups.priorityLevels].map((row) => [
        row.id,
        row.label,
      ]),
    );
  const statusNames = () => new Map(store.statuses.ordered().map((row) => [row.id, row.name]));

  const activeItems = (): Array<FakeItemNode> => {
    const activeProjects = new Set(store.summaries.map((summary) => summary.project.id));
    const activeFolders = new Set(store.folders.map((folder) => folder.id));
    return store
      .allAreas()
      .flatMap((area) => collectNodes(area.nodes))
      .filter(
        ({ item }) =>
          item.deletedAtUtc === null &&
          activeProjects.has(item.projectId) &&
          (item.folderId === null || activeFolders.has(item.folderId)),
      );
  };

  return {
    LoadCalendar: ({
      projectId,
      fromDate,
      toDateExclusive,
      includeCompleted,
    }: {
      projectId: string | null;
      fromDate: string;
      toDateExclusive: string;
      includeCompleted: boolean;
    }) =>
      store.record("LoadCalendar").pipe(
        Effect.andThen(() => {
          if (store.calendar.loadFailure !== null) {
            return Effect.fail(new RuleViolation({ message: store.calendar.loadFailure }));
          }
          if (toDateExclusive <= fromDate) {
            return Effect.fail(
              new RuleViolation({ message: "Calendar range must have a positive length." }),
            );
          }
          const types = typeNames();
          const priorities = priorityLabels();
          const statuses = statusNames();
          const rangeStartMs = isoDateToUtcMillis(fromDate);
          const rangeEndMs = isoDateToUtcMillis(toDateExclusive);
          const entries: Array<WireEntry> = [];

          for (const node of activeItems()) {
            const { item } = node;
            if (projectId !== null && item.projectId !== projectId) {
              continue;
            }
            const isCompleted = item.completedAtUtc !== null;
            if (!includeCompleted && isCompleted) {
              continue;
            }
            const shared = {
              itemId: item.id,
              projectId: item.projectId,
              folderId: item.folderId,
              title: item.title,
              scheduledStart: item.scheduledStart,
              scheduledEnd: item.scheduledEnd,
              isCompleted,
              dueDate: item.dueDate,
              dueTime: item.dueTime,
              itemType: item.itemTypeId === null ? null : (types.get(item.itemTypeId) ?? null),
              priority:
                item.priorityLevelId === null
                  ? null
                  : (priorities.get(item.priorityLevelId) ?? null),
              statusId: item.statusId,
              statusName: item.statusId === null ? null : (statuses.get(item.statusId) ?? null),
              priorityLevelId: item.priorityLevelId,
              urgency: isCompleted ? ("None" as const) : node.ownUrgency,
            };

            if (
              item.dueDate !== null &&
              item.dueDate >= fromDate &&
              item.dueDate < toDateExclusive
            ) {
              entries.push({
                ...shared,
                kind: "due",
                date: item.dueDate,
                startTime: item.dueTime,
              });
            }

            if (item.scheduledStart !== null) {
              const startMs = floatingToUtcMillis(item.scheduledStart);
              const rawEndMs =
                item.scheduledEnd === null ? startMs : floatingToUtcMillis(item.scheduledEnd);
              const endMs =
                rawEndMs > startMs ? rawEndMs : startMs + DEFAULT_BLOCK_MINUTES * 60_000;
              if (startMs < rangeEndMs && endMs > rangeStartMs) {
                entries.push({
                  ...shared,
                  kind: "scheduled",
                  date: item.scheduledStart.slice(0, 10),
                  startTime: item.scheduledStart.slice(11),
                });
              }
            }
          }

          return Effect.succeed({ today: store.calendar.today, entries });
        }),
      ),
    LocateCalendarItem: ({ itemId }: { itemId: string }) =>
      store.record("LocateCalendarItem").pipe(
        Effect.andThen(() => {
          const found = activeItems().find(({ item }) => item.id === itemId);
          return found === undefined
            ? Effect.fail(new NotFound({ entity: "Item", message: "Item is missing or deleted." }))
            : Effect.succeed({
                itemId: found.item.id,
                projectId: found.item.projectId,
                folderId: found.item.folderId,
              });
        }),
      ),
  };
}
