import { expect, it } from "@effect/vitest";
import { createProject, overdueDateBound, summarizeProject } from "../../src/index.js";
import { earlier, now } from "../fixtures.js";

const project = createProject("billing", "Billing DB", earlier);
const noDates = { dueDate: null, dueTime: null };

it("counts only the deadlines that have passed as overdue", () => {
  const today = Temporal.PlainDate.from("2026-11-13");
  const deadlines = [
    { ...noDates, dueDate: today.subtract({ days: 1 }) },
    { ...noDates, dueDate: today, dueTime: Temporal.PlainTime.from("11:59") },
    { ...noDates, dueDate: today, dueTime: Temporal.PlainTime.from("12:00") },
    { ...noDates, dueDate: today },
    noDates,
  ];

  const summary = summarizeProject(project, 9, deadlines, now, "UTC");

  expect(summary).toEqual({ project, openCount: 9, overdueCount: 2 });
});

it("bounds overdue dates two local days after now in the given zone", () => {
  const lateEvening = Temporal.Instant.from("2026-11-13T23:30:00Z");

  const utc = overdueDateBound(lateEvening, "UTC");
  const auckland = overdueDateBound(lateEvening, "Pacific/Auckland");

  expect(utc.toString()).toBe("2026-11-15");
  expect(auckland.toString()).toBe("2026-11-16");
});
