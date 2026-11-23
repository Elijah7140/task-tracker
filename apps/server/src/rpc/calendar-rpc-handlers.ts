import { CalendarRpcs } from "@task-tracker/contracts";
import {
  FloatingTime,
  calculateCalendarEntryUrgency,
  type CalendarEntry,
} from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { CalendarService } from "../services/calendar-service.js";
import { operationTime } from "../services/operation-time.js";
import { mapOperationError } from "./map-operation-error.js";

function projectCalendarEntry(entry: CalendarEntry, now: Temporal.Instant, timeZone: string) {
  return {
    itemId: entry.itemId,
    projectId: entry.projectId,
    folderId: entry.folderId,
    title: entry.title,
    date: entry.date.toString(),
    startTime: entry.startTime === null ? null : entry.startTime.toString(),
    isCompleted: entry.isCompleted,
    dueDate: entry.dueDate === null ? null : entry.dueDate.toString(),
    dueTime: entry.dueTime === null ? null : entry.dueTime.toString(),
    itemType: entry.itemType,
    priority: entry.priority,
    statusId: entry.statusId,
    statusName: entry.statusName,
    priorityLevelId: entry.priorityLevelId,
    urgency: calculateCalendarEntryUrgency(entry, now, timeZone),
  };
}

/** Bind the Calendar RPCs to the transactional Calendar service in the server's zone. */
export const calendarRpcHandlers = (timeZone: string) =>
  CalendarRpcs.toLayer(
    Effect.gen(function* () {
      const calendar = yield* CalendarService;
      return {
        LoadCalendar: ({ projectId, fromDate, toDateExclusive, includeCompleted }) =>
          Effect.gen(function* () {
            const now = yield* operationTime;
            const today = FloatingTime.toFloating(now, timeZone).toPlainDate().toString();
            const entries = yield* calendar.load({
              projectId,
              fromDate: Temporal.PlainDate.from(fromDate),
              toDateExclusive: Temporal.PlainDate.from(toDateExclusive),
              includeCompleted,
            });
            return {
              today,
              entries: entries.map((entry) => projectCalendarEntry(entry, now, timeZone)),
            };
          }).pipe(mapOperationError),
        RescheduleCalendarEntry: (request) => calendar.reschedule(request).pipe(mapOperationError),
        LocateCalendarItem: ({ itemId }) => calendar.locateItem(itemId).pipe(mapOperationError),
      };
    }),
  ).pipe(Layer.provide(CalendarService.layer));
