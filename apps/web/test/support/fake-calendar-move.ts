import type { CalendarReschedule } from "@task-tracker/contracts";
import { addDays } from "../../src/calendar/calendar-dates.js";
import type { FakeItemNode } from "./fake-area-items.js";

type Item = FakeItemNode["item"];
type Request = typeof CalendarReschedule.Type;
type Dates = Pick<Item, "dueDate" | "dueTime" | "scheduledStart" | "scheduledEnd">;

const format = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

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

function milliseconds(text: string) {
  return Date.parse(`${text}Z`);
}

/** Models date writes for browser tests that use the in-memory RPC server. */
export function fakeCalendarMove(item: Item, request: Request): Dates | null {
  const { dueDate, dueTime, scheduledStart, scheduledEnd } = item;
  const dates = { dueDate, dueTime, scheduledStart, scheduledEnd };
  if (request.kind === "due" && dueDate !== null) {
    const { date, time } = destination(dueDate, dueTime, request.target);
    if (date === dueDate && time === dueTime) {
      return null;
    }
    return { ...dates, dueDate: date, dueTime: time };
  }
  if (scheduledStart === null || request.target.type === "all-day") {
    return null;
  }

  const start = milliseconds(scheduledStart);
  const midnight = milliseconds(`${request.sourceDay}T00:00:00`);
  const end = scheduledEnd === null ? start : milliseconds(scheduledEnd);
  const source =
    midnight > start && midnight < (end > start ? end : start + 1_800_000)
      ? `${request.sourceDay}T00:00:00`
      : scheduledStart;
  const { date, time } = destination(source.slice(0, 10), source.slice(11), request.target);
  const delta = milliseconds(`${date}T${time}`) - milliseconds(source);
  if (delta === 0) {
    return null;
  }
  return {
    ...dates,
    scheduledStart: format.format(start + delta).replace(" ", "T"),
    scheduledEnd: scheduledEnd === null ? null : format.format(end + delta).replace(" ", "T"),
  };
}
