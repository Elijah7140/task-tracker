import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
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
          itemTypeId: null,
          priorityLevelId: null,
          dueDate: "2026-11-13",
          dueTime: "06:00:00",
          scheduledStart: null,
          scheduledEnd: null,
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
        kind: "due",
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
