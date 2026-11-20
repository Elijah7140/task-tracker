import { expect, it } from "@effect/vitest";
import { SettingsCatalogue } from "@task-tracker/core";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { ReminderService } from "../../../src/services/reminder-service.js";
import { withSchema } from "../store.js";
import {
  readReminderColumns,
  reminderServices,
  saveDateOnly,
  saveDue,
  START,
  ticksText,
  withReminders,
} from "./reminder-fixtures.js";
import { editFields, filter, query } from "./search-fixtures.js";

const { remindersEnabled, dateOnlyReminderTime, defaultReminderOffset } = SettingsCatalogue;
const day = 864_000_000_000n;

it.effect("The due query respects effective settings, visibility and delivery history", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const due = yield* saveDue(svc, project.id, "Due", START);
      yield* saveDue(svc, project.id, "Future", START.add({ minutes: 1 }));
      yield* saveDue(svc, project.id, "None", START, { kind: "none" });
      yield* svc.items.create(project.id, null, null, "No due date");
      const completed = yield* saveDue(svc, project.id, "Completed", START);
      const deleted = yield* saveDue(svc, project.id, "Deleted", START);
      yield* svc.items.setCompleted(project.id, null, completed.id, true);
      yield* svc.items.delete(project.id, null, deleted.id);
      yield* svc.settings.setGlobal(remindersEnabled, false);

      const disabled = yield* svc.reminders.due(START);

      expect(disabled).toEqual([]);
      yield* svc.settings.setProjectOverride(project.id, remindersEnabled, true);
      const [reminder, ...others] = yield* svc.reminders.due(START);
      expect(others).toEqual([]);
      expect(reminder?.itemId).toBe(due.id);
      expect(reminder?.instant.toString()).toBe(START.toString());
      expect(reminder?.projectName).toBe("Operations");
      const before = yield* svc.undo.status();
      yield* svc.reminders.recordDelivery([reminder!]);
      expect(yield* svc.reminders.due(START)).toEqual([]);
      expect((yield* readReminderColumns(due.id)).ReminderDeliveredFor).toBe(ticksText(START));
      expect((yield* svc.undo.status()).undo).toBe(before.undo);
    }),
  ),
);

it.effect("Moving the due date re-arms a delivered reminder for the new day", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const item = yield* saveDue(svc, project.id, "Prepare report", START);
      const delivered = yield* svc.reminders.due(START);
      yield* svc.reminders.recordDelivery(delivered);

      const tomorrow = START.add({ hours: 24 }).toZonedDateTimeISO("UTC");
      yield* svc.items.edit(
        item.id,
        editFields("Prepare report", {
          dueDate: tomorrow.toPlainDate(),
          dueTime: tomorrow.toPlainTime(),
        }),
      );

      expect(yield* svc.reminders.due(START)).toEqual([]);
      const [rearmed] = yield* svc.reminders.due(START.add({ hours: 24 }));
      expect(rearmed?.itemId).toBe(item.id);
      expect(rearmed?.instant.toString()).toBe("2026-11-18T12:00:00Z");
    }),
  ),
);

it.effect("Pushing back a delivered item one day re-arms its reminder for the new day", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const item = yield* saveDue(svc, project.id, "Prepare report", START);
      yield* svc.reminders.recordDelivery(yield* svc.reminders.due(START));

      yield* svc.items.pushBackOneDay(item.id);

      expect(yield* svc.reminders.due(START)).toEqual([]);
      expect(
        yield* svc.reminders.due(START.add({ hours: 24 }).subtract({ milliseconds: 1 })),
      ).toEqual([]);
      const [rearmed] = yield* svc.reminders.due(START.add({ hours: 24 }));
      expect(rearmed?.itemId).toBe(item.id);
      expect(rearmed?.instant.toString()).toBe("2026-11-18T12:00:00Z");
      expect((yield* readReminderColumns(item.id)).ReminderDeliveredFor).toBe(ticksText(START));
    }),
  ),
);

it.effect("A snooze is undoable even after delivery changes the same row", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const item = yield* saveDue(svc, project.id, "Prepare report", START);
      const [reminder] = yield* svc.reminders.due(START);
      yield* svc.reminders.recordDelivery([reminder!]);

      yield* svc.reminders.snooze(item.id, START, "tenMinutes");

      expect((yield* svc.undo.status()).undo).toBe("Snooze reminder for 'Prepare report'");
      const snoozedUntil = START.add({ minutes: 10 });
      expect((yield* readReminderColumns(item.id)).SnoozedUntilUtc).toBe(ticksText(snoozedUntil));
      expect(yield* svc.reminders.due(START)).toEqual([]);
      yield* TestClock.adjust("10 minutes");
      const deferred = yield* svc.reminders.due(snoozedUntil);
      expect(deferred.map((entry) => entry.instant.toString())).toEqual([snoozedUntil.toString()]);
      yield* svc.reminders.recordDelivery(deferred);

      yield* svc.undo.apply("undo");

      const restored = yield* readReminderColumns(item.id);
      expect(restored.SnoozedUntilUtc).toBeNull();
      expect(restored.ReminderDeliveredFor).toBe(ticksText(snoozedUntil));
      const [again] = yield* svc.reminders.due(snoozedUntil);
      expect(again?.instant.toString()).toBe(START.toString());
    }),
  ),
);

it.effect("Snoozing until tomorrow uses the effective local reminder time", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const item = yield* saveDue(svc, project.id, "Tomorrow", START);
      const time = Temporal.PlainTime.from("10:30");
      yield* svc.settings.setProjectOverride(project.id, dateOnlyReminderTime, time);
      const delivered = yield* svc.reminders.due(START);
      yield* svc.reminders.recordDelivery(delivered);

      yield* svc.reminders.snooze(item.id, START, "tomorrow");

      const stored = yield* readReminderColumns(item.id);
      const expected = Temporal.Instant.from("2026-11-18T10:30:00Z");
      expect(stored.SnoozedUntilUtc).toBe(ticksText(expected));
    }),
  ),
);

it.effect("A snooze is refused once the reminder changed or was not delivered", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const item = yield* saveDue(svc, project.id, "Moved", START);

      const undelivered = yield* Effect.flip(svc.reminders.snooze(item.id, START, "oneHour"));
      const delivered = yield* svc.reminders.due(START);
      yield* svc.reminders.recordDelivery(delivered);
      yield* svc.items.edit(
        item.id,
        editFields("Moved", { dueDate: START.toZonedDateTimeISO("UTC").toPlainDate() }),
      );
      const moved = yield* Effect.flip(svc.reminders.snooze(item.id, START, "oneHour"));
      yield* svc.items.delete(project.id, null, item.id);
      const missing = yield* Effect.flip(svc.reminders.snooze(item.id, START, "oneHour"));

      expect(undelivered.message).toBe("This reminder has changed.");
      expect(moved.message).toBe("This reminder has changed.");
      expect(missing.message).toBe("This item is no longer available.");
    }),
  ),
);

it.effect("has:reminder matches only open items with an enabled due reminder", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      yield* saveDue(svc, project.id, "Active", START);
      yield* saveDue(svc, project.id, "None", START, { kind: "none" });
      yield* svc.items.create(project.id, null, null, "Undated");
      const complete = yield* saveDue(svc, project.id, "Complete", START);
      yield* svc.items.setCompleted(project.id, null, complete.id, true);
      const hasReminder = query([filter("reminder", "isNotEmpty")]);
      const noReminder = query([filter("reminder", "isEmpty")], { includeCompleted: false });

      const active = yield* svc.search.search(hasReminder);
      const inactive = yield* svc.search.search(noReminder);

      expect(active.items.map((item) => item.title)).toEqual(["Active"]);
      expect(inactive.items.map((item) => item.title).toSorted()).toEqual(["None", "Undated"]);
      yield* svc.settings.setProjectOverride(project.id, remindersEnabled, false);
      expect((yield* svc.search.search(hasReminder)).items).toEqual([]);
    }),
  ),
);

it.effect("Malformed stored settings fall back to their defaults for the due query", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const yesterday = Temporal.PlainDate.from("2026-11-16");
      const item = yield* saveDateOnly(svc, project.id, "Corrupt settings", yesterday);
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO GlobalSetting (Key, Value) VALUES ('defaultReminderOffset', 'not a duration')`;
      yield* sql`INSERT INTO ProjectSetting (ProjectId, Key, Value)
        VALUES (${project.id}, 'dateOnlyReminderTime', '25:99')`;

      const reminders = yield* svc.reminders.due(START);

      expect(reminders.map((entry) => entry.itemId)).toEqual([item.id]);
      expect(reminders[0]?.instant.toString()).toBe("2026-11-16T08:00:00Z");
    }),
  ),
);

it.effect("The due query still finds items that only a large default offset makes due", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const today = Temporal.PlainDate.from("2026-11-17");
      yield* svc.settings.setProjectOverride(project.id, defaultReminderOffset, 30n * day);
      const farAhead = yield* saveDateOnly(
        svc,
        project.id,
        "Twenty days ahead",
        today.add({ days: 20 }),
      );
      yield* saveDateOnly(svc, project.id, "Forty days ahead", today.add({ days: 40 }));
      const weekAhead = yield* svc.items.create(project.id, null, null, "Six days ahead");
      yield* svc.items.edit(
        weekAhead.id,
        editFields("Six days ahead", {
          dueDate: today.add({ days: 6 }),
          dueTime: Temporal.PlainTime.from("00:00"),
          reminder: { kind: "offset", minutes: 10080 },
        }),
      );

      const due = yield* svc.reminders.due(START);

      expect(due.map((entry) => entry.itemId).toSorted()).toEqual(
        [farAhead.id, weekAhead.id].toSorted(),
      );
    }),
  ),
);

it.effect("The editor saves the reminder choice and undo restores the previous one", () =>
  withReminders((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Operations");
      const item = yield* saveDue(svc, project.id, "Choice", START, { kind: "default" });

      yield* svc.items.edit(
        item.id,
        editFields("Choice", {
          dueDate: Temporal.PlainDate.from("2026-11-17"),
          dueTime: Temporal.PlainTime.from("12:00"),
          reminder: { kind: "offset", minutes: 15 },
        }),
      );

      const chosen = yield* readReminderColumns(item.id);
      const area = yield* svc.items.loadArea(project.id, null);
      expect([chosen.ReminderMode, chosen.ReminderOffsetMinutes]).toEqual([2, 15]);
      expect(area.items.open[0]?.item.reminder).toEqual({ kind: "offset", minutes: 15 });
      const [due] = yield* svc.reminders.due(START);
      expect(due?.instant.toString()).toBe("2026-11-17T11:45:00Z");
      yield* svc.undo.apply("undo");
      const restored = yield* readReminderColumns(item.id);
      expect([restored.ReminderMode, restored.ReminderOffsetMinutes]).toEqual([null, null]);
      const invalid = yield* Effect.flip(
        svc.items.edit(item.id, editFields("Choice", { reminder: { kind: "offset", minutes: 7 } })),
      );
      expect(invalid.message).toBe("Choose one of the listed reminder offsets.");
    }),
  ),
);

it.effect("The due query resolves floating reminders in the server zone across DST", () =>
  withSchema(
    Effect.gen(function* () {
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-02T00:00:00Z").epochMilliseconds);
      const svc = yield* reminderServices;
      const reminders = yield* Effect.provide(
        Effect.gen(function* () {
          return yield* ReminderService;
        }),
        ReminderService.layer("America/New_York"),
      );
      const project = yield* svc.projects.create("Operations");
      const hour = { kind: "offset", minutes: 60 } as const;
      const edit = (title: string, date: string, time: string) =>
        editFields(title, {
          dueDate: Temporal.PlainDate.from(date),
          dueTime: Temporal.PlainTime.from(time),
          reminder: hour,
        });
      const gap = yield* svc.items.create(project.id, null, null, "Gap");
      const repeated = yield* svc.items.create(project.id, null, null, "Repeated");
      yield* svc.items.edit(gap.id, edit("Gap", "2026-03-08", "03:30"));
      yield* svc.items.edit(repeated.id, edit("Repeated", "2026-11-01", "02:30"));

      const due = yield* reminders.due(Temporal.Instant.from("2026-11-02T00:00:00Z"));

      expect(due.map((entry) => [entry.title, entry.instant.toString()])).toEqual([
        ["Repeated", "2026-11-01T05:30:00Z"],
        ["Gap", "2026-03-08T07:00:00Z"],
      ]);
    }),
  ),
);
