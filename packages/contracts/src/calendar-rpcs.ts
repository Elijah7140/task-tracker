import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { CalendarItemLocation, CalendarSnapshot } from "./calendar-entry.js";
import { CalendarReschedule, CalendarRescheduleResult } from "./calendar-reschedule.js";
import { Guid } from "./guid.js";
import { IsoDate } from "./iso-date-time.js";
import { RpcOperationError } from "./rpc-operation-error.js";

/** Scoped calendar reads, activation and rescheduling (§7.4). */
export const CalendarRpcs = RpcGroup.make(
  Rpc.make("LoadCalendar", {
    payload: {
      projectId: Schema.NullOr(Guid),
      fromDate: IsoDate,
      toDateExclusive: IsoDate,
      includeCompleted: Schema.Boolean,
    },
    success: CalendarSnapshot,
    error: RpcOperationError,
  }),
  Rpc.make("RescheduleCalendarEntry", {
    payload: CalendarReschedule,
    success: CalendarRescheduleResult,
    error: RpcOperationError,
  }),
  Rpc.make("LocateCalendarItem", {
    payload: { itemId: Guid },
    success: CalendarItemLocation,
    error: RpcOperationError,
  }),
);
