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

it.effect(
  "Undo after renaming a priority or a choice reverts that rename, not the step before",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const type = yield* client.AddPriorityLevel({ name: "Review" });
        const field = yield* client.CreateField({
          name: "Size",
          dataType: "Choice",
          projectId: null,
        });
        const choice = yield* client.AddFieldChoice({ fieldId: field.id, label: "Small" });
        yield* client.RenamePriorityLevel({ id: type.id, name: "Audit" });
        yield* client.RenameFieldChoice({ fieldId: field.id, choiceId: choice.id, label: "Tiny" });
        const latest = yield* client.GetHistory();

        const choiceUndo = yield* client.ApplyHistory({ direction: "undo" });
        const choices = yield* client.ListFieldChoices({ fieldId: field.id });
        const typeUndo = yield* client.ApplyHistory({ direction: "undo" });
        const types = yield* client.ListPriorityLevels();
        const remaining = yield* client.GetHistory();

        expect(latest.undo).toBe("Rename choice 'Tiny'");
        expect(choiceUndo?.label).toBe("Rename choice 'Tiny'");
        expect(choices).toMatchObject([{ id: choice.id, label: "Small" }]);
        expect(typeUndo?.label).toBe("Rename priority 'Audit'");
        expect(types).toContainEqual(expect.objectContaining({ id: type.id, name: "Review" }));
        expect(remaining).toMatchObject({
          undo: "Add choice 'Small'",
          redo: "Rename priority 'Audit'",
        });
      }),
    ),
);

it.effect(
  "A refused field replay keeps the RPC history position and reports a rule violation",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const sql = yield* SqlClient.SqlClient;
        const field = yield* client.CreateField({
          name: "Impact",
          dataType: "Text",
          projectId: null,
        });
        yield* client.RenameField({ fieldId: field.id, name: "Effect" });
        yield* sql`UPDATE FieldDefinition SET SortOrder = 7 WHERE Id = ${field.id}`;

        const refusal = yield* Effect.flip(client.ApplyHistory({ direction: "undo" }));

        expect(refusal).toMatchObject({
          _tag: "RuleViolation",
          message: "This field changed since; can't undo.",
        });
        expect(yield* client.ListFields({ projectId: null })).toMatchObject([
          { id: field.id, displayName: "Effect" },
        ]);
        expect(yield* client.GetHistory()).toMatchObject({
          undo: "Rename field 'Effect'",
          redo: null,
        });
      }),
    ),
);
