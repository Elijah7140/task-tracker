import { expect, it } from "@effect/vitest";
import { CalendarReschedule } from "@task-tracker/contracts";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect("Loads scoped calendar entries with server urgency and locates active items", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const folder = yield* client.CreateFolder({
        projectId: project.id,
        parentFolderId: null,
        name: "Invoices",
      });
      const due = yield* client.CreateItem({
        projectId: project.id,
        folderId: folder.id,
        parentItemId: null,
        title: "Pay vendor",
      });
      yield* client.EditItem({
        itemId: due.id,
        fields: {
          title: "Pay vendor",
          description: null,
          ticketNumber: null,
          priorityLevelId: null,
          dueDate: "2026-11-13",
          dueTime: "06:00:00",
        },
      });

      const snapshot = yield* client.LoadCalendar({
        projectId: project.id.toLowerCase(),
        fromDate: "2026-11-01",
        toDateExclusive: "2026-12-01",
        includeCompleted: false,
      });

      expect(snapshot.today).toBe("2026-11-13");
      expect(snapshot.entries).toHaveLength(1);
      expect(snapshot.entries[0]).toMatchObject({
        itemId: due.id,
        projectId: project.id,
        folderId: folder.id,
        title: "Pay vendor",
        date: "2026-11-13",
        urgency: "Overdue",
      });

      const location = yield* client.LocateCalendarItem({ itemId: due.id.toLowerCase() });
      expect(location).toEqual({
        itemId: due.id,
        projectId: project.id,
        folderId: folder.id,
      });

      yield* client.DeleteItem({ projectId: project.id, folderId: folder.id, itemId: due.id });
      const missing = yield* Effect.flip(client.LocateCalendarItem({ itemId: due.id }));
      expect(missing).toMatchObject({ _tag: "NotFound", entity: "Item" });

      const invalidRange = yield* Effect.flip(
        client.LoadCalendar({
          projectId: null,
          fromDate: "2026-11-13",
          toDateExclusive: "2026-11-13",
          includeCompleted: false,
        }),
      );
      expect(invalidRange).toMatchObject({ _tag: "RuleViolation" });
    }),
  ),
);

it.effect.each([
  {
    day: "2026-03-08",
    next: "2026-03-09",
    minute: 150,
    time: "02:30:00",
    now: "2026-03-08T07:01:00Z",
  },
  {
    day: "2026-11-01",
    next: "2026-11-02",
    minute: 90,
    time: "01:30:00",
    now: "2026-11-01T05:45:00Z",
  },
])(
  "Keeps the rescheduled time floating and computes urgency in New York on $day",
  ({ day, next, minute, time, now }) =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Billing" });
        const item = yield* client.CreateItem({
          projectId: project.id,
          folderId: null,
          parentItemId: null,
          title: "Review",
        });
        yield* client.EditItem({
          itemId: item.id,
          fields: {
            title: item.title,
            description: null,
            ticketNumber: null,
            priorityLevelId: null,
            dueDate: next,
            dueTime: null,
          },
        });
        yield* TestClock.setTime(Date.parse(now));
        const input = {
          itemId: item.id.toLowerCase(),
          target: { type: "time", date: day, minute },
        } as const;

        const moved = yield* client.RescheduleCalendarEntry(input);
        const calendar = yield* client.LoadCalendar({
          projectId: project.id,
          fromDate: day,
          toDateExclusive: next,
          includeCompleted: false,
        });
        const history = yield* client.GetHistory();
        yield* client.DeleteItem({ projectId: project.id, folderId: null, itemId: item.id });
        const missing = yield* Effect.flip(client.RescheduleCalendarEntry(input));

        expect(moved).toEqual({
          itemId: item.id,
          projectId: project.id,
          folderId: null,
          date: day,
        });
        expect(calendar.entries[0]).toMatchObject({ date: day, dueTime: time, urgency: "Overdue" });
        expect(history.undo).toBe("Reschedule 'Review'");
        expect(missing).toMatchObject({ _tag: "NotFound", entity: "Item" });
      }),
    ),
);

it("Reschedule intents reject absolute UTC timestamps as dates", () => {
  const decode = Schema.decodeUnknownSync(CalendarReschedule);

  expect(() =>
    decode({
      itemId: "019A0000-0000-7000-8000-000000000001",
      target: { type: "time", date: "2026-11-17T08:00:00Z", minute: 480 },
    }),
  ).toThrow();
});
