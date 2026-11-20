import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect("Sets, reads and clears the current item over RPC outside undo history", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Release" });
      const item = yield* client.CreateItem({
        projectId: project.id,
        folderId: null,
        parentItemId: null,
        title: "Review release notes",
      });

      yield* client.SetCurrentItem({ itemId: item.id.toLowerCase() });

      expect(yield* client.LoadCurrentItem()).toEqual({
        itemId: item.id,
        projectId: project.id,
        folderId: null,
        title: "Review release notes",
        areaPath: "Release",
        statusName: null,
        priorityName: null,
        dueDate: null,
        dueTime: null,
        isCompleted: false,
        description: null,
      });
      expect((yield* client.GetHistory()).undo).toBe("Create 'Review release notes'");
      yield* client.SetCurrentItem({ itemId: null });
      expect(yield* client.LoadCurrentItem()).toBeNull();
    }),
  ),
);

it.effect("Hides a deleted current item until the trash restores it", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Release" });
      const area = { projectId: project.id, folderId: null };
      const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Ship" });
      yield* client.SetCurrentItem({ itemId: item.id });

      const batchId = yield* client.DeleteItem({ ...area, itemId: item.id });
      const whileDeleted = yield* client.LoadCurrentItem();
      const refused = yield* Effect.flip(client.SetCurrentItem({ itemId: item.id }));
      yield* client.RestoreTrashBatch({ batchId });

      expect(whileDeleted).toBeNull();
      expect(refused).toMatchObject({
        _tag: "RuleViolation",
        message: "This item is no longer available.",
      });
      expect((yield* client.LoadCurrentItem())?.itemId).toBe(item.id);
    }),
  ),
);
