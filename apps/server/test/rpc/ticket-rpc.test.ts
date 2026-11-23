import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const testingStatusId = "019A0000-0000-7000-8000-000000000203";

const fields = (title: string, ticketNumber: string, priorityLevelId: string | null = null) => ({
  title,
  description: null,
  ticketNumber,
  itemTypeId: null,
  priorityLevelId,
  dueDate: "2026-11-20",
  dueTime: null,
});

it.effect("Lists labelled sections and moves tickets with undo through RPC", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const billing = yield* client.CreateProject({ name: "Billing" });
      const portal = yield* client.CreateProject({ name: "Customer portal" });
      const hotfix = yield* client.AddPriorityLevel({ name: "Hotfix", number: 7 });
      const create = (projectId: string, title: string) =>
        client.CreateItem({ projectId, folderId: null, parentItemId: null, title });
      const review = yield* create(billing.id, "Review payment reconciliation");
      yield* TestClock.adjust("1 second");
      const fix = yield* create(portal.id, "Fix statement import");
      yield* client.EditItem({ itemId: review.id, fields: fields(review.title, "PAY-173") });
      yield* client.EditItem({ itemId: fix.id, fields: fields(fix.title, "WEB-42", hotfix.id) });
      yield* client.SetItemStatus({ itemId: review.id, statusId: testingStatusId });

      const board = yield* client.LoadTickets({ projectId: null });

      expect(board.projects).toEqual([
        { id: billing.id, name: "Billing" },
        { id: portal.id, name: "Customer portal" },
      ]);
      expect(board.sections.map(({ label }) => label)).toEqual([
        "No priority",
        "Critical",
        "High",
        "Medium",
        "Low",
        "7 · Hotfix",
      ]);
      expect(board.sections[0]?.tickets).toEqual([
        {
          itemId: review.id,
          projectId: billing.id,
          folderId: null,
          projectName: "Billing",
          ticketNumber: "PAY-173",
          title: "Review payment reconciliation",
          statusId: testingStatusId,
          statusName: "Testing",
          priorityLevelId: null,
          dueDate: "2026-11-20",
          dueTime: null,
        },
      ]);

      const position = { priorityLevelId: hotfix.id, anchorId: fix.id, after: false };
      expect(yield* client.MoveTicket({ itemId: review.id, position })).toBe(true);
      expect(yield* client.GetHistory()).toMatchObject({
        undo: "Move 'Review payment reconciliation'",
      });
      const moved = yield* client.LoadTickets({ projectId: portal.id });
      expect(moved.sections.at(-1)?.tickets.map(({ itemId }) => itemId)).toEqual([fix.id]);
      expect(yield* client.SetTicketPriority({ itemId: fix.id, priorityLevelId: null })).toBe(true);
      yield* client.ApplyHistory({ direction: "undo" });
      yield* client.ApplyHistory({ direction: "undo" });
      const restored = yield* client.LoadTickets({ projectId: null });
      expect(restored.sections[0]?.tickets.map(({ itemId }) => itemId)).toEqual([review.id]);
    }),
  ),
);

it.effect("Reports a refused move as a rule violation", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const item = yield* client.CreateItem({
        projectId: project.id,
        folderId: null,
        parentItemId: null,
        title: "Plain",
      });

      const failure = yield* Effect.flip(
        client.MoveTicket({
          itemId: item.id,
          position: { priorityLevelId: null, anchorId: null, after: false },
        }),
      );

      expect(failure).toMatchObject({
        _tag: "RuleViolation",
        message: "This item is no longer an open ticket.",
      });
    }),
  ),
);
