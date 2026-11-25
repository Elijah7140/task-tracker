import {
  type CalendarEntry,
  type CalendarReschedule,
  NotFound,
  OperationFailed,
  RuleViolation,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import { FAKE_LOOKUPS, type FakeItemNode } from "./fake-area-items.js";
import { fakeCalendarMove } from "./fake-calendar-move.js";
import type { FakeProjectStore } from "./fake-task-tracker-server.js";

type WireEntry = typeof CalendarEntry.Type;

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
  /** Simulates an unexpected write failure. */
  moveFailure = false;
}

/** Fake RPC handlers for `LoadCalendar` and `LocateCalendarItem`. */
export function calendarHandlers(store: FakeProjectStore) {
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
          const priorities = priorityLabels();
          const statuses = statusNames();
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
              isCompleted,
              dueDate: item.dueDate,
              dueTime: item.dueTime,
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
              entries.push({ ...shared, date: item.dueDate, startTime: item.dueTime });
            }
          }

          return Effect.succeed({ today: store.calendar.today, entries });
        }),
      ),
    RescheduleCalendarEntry: (request: typeof CalendarReschedule.Type) =>
      store.record("RescheduleCalendarEntry").pipe(
        Effect.andThen(
          Effect.gen(function* () {
            if (store.calendar.moveFailure) {
              return yield* Effect.fail(
                new OperationFailed({ message: "The operation could not be completed." }),
              );
            }
            const item = activeItems().find(({ item }) => item.id === request.itemId)?.item;
            if (item === undefined) {
              return yield* Effect.fail(
                new NotFound({ entity: "Item", message: "Item is missing or deleted." }),
              );
            }
            if (item.dueDate === null) {
              return yield* Effect.fail(
                new RuleViolation({ message: "Item has no due date to move." }),
              );
            }
            const dates = fakeCalendarMove(item, request);
            if (dates === null) {
              return null;
            }
            store.patchItem(item.id, { ...dates, updatedAtUtc: store.nextTimestamp() });
            const date = dates.dueDate!;
            return { itemId: item.id, folderId: item.folderId, projectId: item.projectId, date };
          }),
        ),
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
