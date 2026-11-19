import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { connectRenderer, startedAtUtc, withRendererRpc } from "./support/renderer-rpc.js";

const fields = {
  title: "Pay invoices",
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: "2026-11-13",
  // 07:00 in the server zone (New York) is the test's start instant.
  dueTime: "07:00:00",
  scheduledStart: null,
  scheduledEnd: null,
};

it.effect("Delivers a saved reminder to a waiting panel, then snoozes it as one undo step", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const area = { projectId: project.id, folderId: null };
      const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Pay invoices" });
      const empty = yield* client.WatchReminders({ afterVersion: -1 });

      yield* client.EditItem({
        itemId: item.id,
        fields,
        reminder: { kind: "offset", minutes: 0 },
      });
      const delivered = yield* client.WatchReminders({ afterVersion: empty.version });
      const [entry] = delivered.reminders;
      yield* client.SnoozeReminder({
        itemId: item.id,
        instantUtc: entry!.instantUtc,
        option: "tenMinutes",
      });
      const snoozed = yield* client.WatchReminders({ afterVersion: delivered.version });

      expect(empty.reminders).toEqual([]);
      expect(entry).toEqual({
        itemId: item.id,
        title: "Pay invoices",
        projectId: project.id,
        folderId: null,
        projectName: "Billing",
        instantUtc: startedAtUtc,
      });
      expect(snoozed.reminders).toEqual([]);
      expect((yield* client.GetHistory()).undo).toBe("Snooze reminder for 'Pay invoices'");
      expect((yield* client.LoadArea(area)).items.open[0]?.item.reminder).toEqual({
        kind: "offset",
        minutes: 0,
      });
    }),
  ),
);

it.effect("Refuses a stale snooze and dismisses without recording history", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const area = { projectId: project.id, folderId: null };
      const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Pay invoices" });
      const empty = yield* client.WatchReminders({ afterVersion: -1 });
      yield* client.EditItem({ itemId: item.id, fields, reminder: { kind: "offset", minutes: 0 } });
      const delivered = yield* client.WatchReminders({ afterVersion: empty.version });
      const history = yield* client.GetHistory();

      const stale = yield* Effect.flip(
        client.SnoozeReminder({
          itemId: item.id,
          instantUtc: "2026-11-13T11:00:00Z",
          option: "oneHour",
        }),
      );
      yield* client.DismissReminder({ itemId: item.id });
      const dismissed = yield* client.WatchReminders({ afterVersion: delivered.version });

      expect(stale).toMatchObject({ _tag: "RuleViolation", message: "This reminder has changed." });
      expect(dismissed.reminders).toEqual([]);
      expect(yield* client.GetHistory()).toEqual(history);
    }),
  ),
);

it.effect("Loads and saves reminder defaults and project overrides with the settings forms", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const global = yield* client.LoadGlobalSettings();

      yield* client.SaveGlobalSettings({
        settings: {
          ...global,
          reminders: {
            remindersEnabled: true,
            defaultReminderOffset: "9000000000",
            dateOnlyReminderTime: "08:30",
          },
        },
      });
      yield* client.SaveProjectSettings({
        projectId: project.id,
        overrides: {
          autoCompleteParents: null,
          urgencyYellowThreshold: null,
          urgencyRedThreshold: null,
          reminders: {
            remindersEnabled: false,
            defaultReminderOffset: null,
            dateOnlyReminderTime: null,
          },
        },
      });
      const saved = yield* client.LoadGlobalSettings();
      const overridden = yield* client.LoadProjectSettings({ projectId: project.id });

      expect(global.reminders).toEqual({
        remindersEnabled: true,
        defaultReminderOffset: "36000000000",
        dateOnlyReminderTime: "09:00:00",
      });
      expect(saved.reminders).toEqual({
        remindersEnabled: true,
        defaultReminderOffset: "9000000000",
        dateOnlyReminderTime: "08:30:00",
      });
      expect(overridden.reminders).toEqual({
        remindersEnabled: { value: false, source: "Project" },
        defaultReminderOffset: { value: "9000000000", source: "Global" },
        dateOnlyReminderTime: { value: "08:30:00", source: "Global" },
      });
    }),
  ),
);
