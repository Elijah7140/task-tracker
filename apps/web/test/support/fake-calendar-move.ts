import type { CalendarReschedule } from "@task-tracker/contracts";
import { addDays } from "../../src/calendar/calendar-dates.js";
import type { FakeItemNode } from "./fake-area-items.js";

type Item = FakeItemNode["item"];
type Request = typeof CalendarReschedule.Type;
type Dates = Pick<Item, "dueDate" | "dueTime">;

function timeAt(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
}

function stepTime(time: string, quarters: number) {
  if (quarters === 0) {
    return time;
  }
  const [hour, minute, second] = time.split(":").map(Number);
  const current = hour! * 4 + minute! / 15 + (second ?? 0) / 900;
  const edge = quarters > 0 ? Math.floor(current) : Math.ceil(current);
  return timeAt(15 * Math.min(95, Math.max(0, edge + quarters)));
}

function destination(date: string, time: string | null, target: Request["target"]) {
  switch (target.type) {
    case "step":
      return {
        date: addDays(date, target.days),
        time: time === null ? null : stepTime(time, target.quarters),
      };
    case "time":
      return { date: target.date, time: timeAt(target.minute) };
    case "month":
      return { date: target.date, time };
    case "all-day":
      return { date: target.date, time: null };
  }
}

/** Models due date writes for browser tests that use the in-memory RPC server. */
export function fakeCalendarMove(item: Item, request: Request): Dates | null {
  const { dueDate, dueTime } = item;
  if (dueDate === null) {
    return null;
  }
  const { date, time } = destination(dueDate, dueTime, request.target);
  if (date === dueDate && time === dueTime) {
    return null;
  }
  return { dueDate: date, dueTime: time };
}
