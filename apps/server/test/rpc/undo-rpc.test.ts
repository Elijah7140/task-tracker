import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect(
  "Replays project actions through RPC and reports refusals with the operation error union",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const sql = yield* SqlClient.SqlClient;
        const project = yield* client.CreateProject({ name: "Original" });
        yield* client.RenameProject({ projectId: project.id, name: "Renamed" });

        const undone = yield* client.ApplyHistory({ direction: "undo" });
        const restored = yield* client.ListProjects();
        yield* client.ApplyHistory({ direction: "redo" });
        yield* sql`UPDATE Project SET Name = 'External' WHERE Id = ${project.id}`;
        const refusal = yield* Effect.flip(client.ApplyHistory({ direction: "undo" }));

        expect(undone?.label).toBe("Rename 'Renamed'");
        expect(restored).toMatchObject([{ project: { name: "Original" } }]);
        expect(refusal).toMatchObject({
          _tag: "RuleViolation",
          message: "This project changed since; can't undo.",
        });
        expect(yield* client.GetHistory()).toMatchObject({ undo: "Rename 'Renamed'", redo: null });
      }),
    ),
);

it.effect(
  "A completion preview leaves RPC history intact and the committed cascade replays together",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Project" });
        const area = { projectId: project.id, folderId: null };
        const parent = yield* client.CreateItem({ ...area, title: "Parent", parentItemId: null });
        const child = yield* client.CreateItem({
          ...area,
          title: "Child",
          parentItemId: parent.id,
        });
        const before = yield* client.GetHistory();
        const completion = { ...area, itemId: parent.id, completed: true };

        const preview = yield* client.SetItemCompleted(completion);

        expect(preview.kind).toBe("needs-confirmation");
        expect(yield* client.GetHistory()).toEqual(before);
        yield* client.SetItemCompleted({ ...completion, confirmedOpenItemIds: [child.id] });
        expect((yield* client.LoadArea(area)).items.finished).toHaveLength(1);
        expect((yield* client.ApplyHistory({ direction: "undo" }))?.label).toBe(
          "Complete 'Parent'",
        );
        expect((yield* client.LoadArea(area)).items.open).toMatchObject([
          {
            item: { id: parent.id, completedAtUtc: null },
            children: { open: [{ item: { id: child.id, completedAtUtc: null } }] },
          },
        ]);
        expect((yield* client.ApplyHistory({ direction: "redo" }))?.label).toBe(
          "Complete 'Parent'",
        );
        expect((yield* client.LoadArea(area)).items.finished).toMatchObject([
          { item: { id: parent.id } },
        ]);
      }),
    ),
);
