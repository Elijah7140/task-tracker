import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect("Lists, restores, purges and empties through the same RPC and undo session", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const area = { projectId: project.id, folderId: null };
      const parent = yield* client.CreateItem({ ...area, title: "Parent", parentItemId: null });
      const child = yield* client.CreateItem({ ...area, title: "Child", parentItemId: parent.id });
      const childBatch = yield* client.DeleteItem({ ...area, itemId: child.id });
      const parentBatch = yield* client.DeleteItem({ ...area, itemId: parent.id });

      expect(yield* client.ListTrash({ projectId: project.id.toLowerCase() })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            batchId: childBatch,
            path: ["Billing", "Parent"],
            deletedAt: "2026-11-13T07:00:00",
            restoreBlockedReason: "Restore the item 'Parent' first",
          }),
        ]),
      );
      const blocked = yield* Effect.flip(client.RestoreTrashBatch({ batchId: childBatch }));
      expect(blocked).toMatchObject({
        _tag: "RuleViolation",
        message: "Restore the item 'Parent' first",
      });

      yield* client.RestoreTrashBatch({ batchId: parentBatch });
      expect(yield* client.GetHistory()).toMatchObject({ undo: "Restore 'Parent'" });
      yield* client.ApplyHistory({ direction: "undo" });
      expect(yield* client.ListTrash({ projectId: null })).toHaveLength(2);

      yield* client.PurgeTrashBatch({ batchId: childBatch });
      yield* client.EmptyTrash({ projectId: project.id });
      expect(yield* client.ListTrash({ projectId: null })).toEqual([]);
    }),
  ),
);
