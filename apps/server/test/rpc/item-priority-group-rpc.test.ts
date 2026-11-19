import { expect, it } from "@effect/vitest";
import { builtInPriorityLevels } from "@task-tracker/core";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const highId = builtInPriorityLevels[1].id;
const lowId = builtInPriorityLevels[3].id;

it.effect("MoveItemToPriorityGroup moves an item, updates priority and replays through Undo", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing DB" });
      const area = { projectId: project.id, folderId: null };
      const first = yield* client.CreateItem({ ...area, parentItemId: null, title: "First" });
      const second = yield* client.CreateItem({ ...area, parentItemId: null, title: "Second" });

      yield* client.MoveItemToPriorityGroup({
        ...area,
        itemId: second.id,
        priorityLevelId: highId,
        index: 0,
      });
      const moved = yield* client.LoadArea(area);
      const history = yield* client.GetHistory();

      expect(moved.items.open.map((node) => node.item.id)).toEqual([second.id, first.id]);
      expect(moved.items.open[0]?.item.priorityLevelId).toBe(highId);
      expect(history.undo).toBe("Set priority of 'Second'");

      yield* client.ApplyHistory({ direction: "undo" });
      const restored = yield* client.LoadArea(area);

      expect(restored.items.open.map((node) => node.item.id)).toEqual([first.id, second.id]);
      expect(restored.items.open[1]?.item.priorityLevelId).toBeNull();
    }),
  ),
);

it.effect(
  "MoveItemToPriorityGroup rejects an archived priority and leaves the area unchanged",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Billing DB" });
        const area = { projectId: project.id, folderId: null };
        const first = yield* client.CreateItem({ ...area, parentItemId: null, title: "First" });
        yield* client.CreateItem({ ...area, parentItemId: null, title: "Second" });
        yield* client.ArchivePriorityLevel({ id: lowId });

        const failure = yield* Effect.flip(
          client.MoveItemToPriorityGroup({
            ...area,
            itemId: first.id,
            priorityLevelId: lowId,
            index: 1,
          }),
        );
        const snapshot = yield* client.LoadArea(area);

        expect(failure._tag).toBe("RuleViolation");
        expect(snapshot.items.open[0]?.item.id).toBe(first.id);
        expect(snapshot.items.open[0]?.item.priorityLevelId).toBeNull();
      }),
    ),
);

it.effect("SaveGlobalSettings persists workspaceCardColumns and LoadArea exposes it", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing DB" });
      const initial = yield* client.LoadGlobalSettings();

      expect(initial.workspaceCardColumns).toBe(4);

      yield* client.SaveGlobalSettings({
        settings: { ...initial, workspaceCardColumns: 6 },
      });
      const saved = yield* client.LoadGlobalSettings();
      const area = yield* client.LoadArea({ projectId: project.id, folderId: null });

      expect(saved.workspaceCardColumns).toBe(6);
      expect(area.settings.workspaceCardColumns).toEqual({ value: 6, source: "Global" });
    }),
  ),
);
