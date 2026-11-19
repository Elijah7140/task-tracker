import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect("Saves, opens, renames, reorders and deletes saved searches with undo", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const parsed = yield* client.ParseSearchQuery({
        scope: { kind: "project", projectId: project.id },
        text: "deadlock priority:high",
      });
      const stableText = parsed.kind === "parsed" ? parsed.stableText : "";
      const scope = { kind: "project" as const, projectId: project.id.toLowerCase() };

      const errors = yield* client.SaveSavedSearch({
        name: " Errors ",
        definition: { queryText: stableText, scope, includeCompleted: true },
        overwrite: false,
      });
      const other = yield* client.SaveSavedSearch({
        name: "Other",
        definition: { queryText: "", scope: { kind: "allProjects" }, includeCompleted: false },
        overwrite: false,
      });
      const clash = yield* Effect.flip(
        client.SaveSavedSearch({
          name: "errors",
          definition: { queryText: "", scope: { kind: "allProjects" }, includeCompleted: false },
          overwrite: false,
        }),
      );
      yield* client.RenameSavedSearch({ savedSearchId: errors.id, name: "Failures" });
      yield* client.ReorderSavedSearches({ savedSearchIds: [other.id] });

      expect(stableText).toMatch(/^deadlock priority:#[0-9A-F-]{36}$/);
      expect(clash).toMatchObject({
        _tag: "RuleViolation",
        message: "A saved search named 'Errors' already exists.",
      });
      expect(yield* client.FindSavedSearch({ savedSearchId: errors.id.toLowerCase() })).toEqual({
        id: errors.id,
        name: "Failures",
        queryText: stableText,
        scope: { kind: "project", projectId: project.id },
        includeCompleted: true,
      });
      expect((yield* client.ListSavedSearches()).map((search) => search.name)).toEqual([
        "Other",
        "Failures",
      ]);
      expect(yield* client.GetHistory()).toMatchObject({ undo: "Reorder saved searches" });

      yield* client.DeleteSavedSearch({ savedSearchId: errors.id });
      const missing = yield* Effect.flip(client.FindSavedSearch({ savedSearchId: errors.id }));
      expect(missing).toMatchObject({
        _tag: "NotFound",
        entity: "SavedSearch",
        message: "This saved search no longer exists.",
      });
      yield* client.ApplyHistory({ direction: "undo" });
      expect(yield* client.FindSavedSearch({ savedSearchId: errors.id })).toMatchObject({
        name: "Failures",
      });
    }),
  ),
);

it.effect(
  "A stored query survives renamed labels and reports archived fields, choices and projects",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Billing" });
        const scope = { kind: "project" as const, projectId: project.id };
        const stage = yield* client.CreateField({
          name: "Stage",
          dataType: "Choice",
          projectId: null,
        });
        const effort = yield* client.CreateField({
          name: "Effort",
          dataType: "Number",
          projectId: null,
        });
        const ready = yield* client.AddFieldChoice({ fieldId: stage.id, label: "Ready" });
        const parse = (text: string) => client.ParseSearchQuery({ scope, text });
        const stable = (yield* parse("stage:ready effort>3 due<today")) as { stableText: string };
        const saved = yield* client.SaveSavedSearch({
          name: "Ready",
          definition: { queryText: stable.stableText, scope, includeCompleted: false },
          overwrite: false,
        });
        const stored = (yield* client.FindSavedSearch({ savedSearchId: saved.id })).queryText;

        yield* client.RenameFieldChoice({ fieldId: stage.id, choiceId: ready.id, label: "Go" });
        const renamed = yield* parse(stored);
        yield* client.ArchiveFieldChoice({ fieldId: stage.id, choiceId: ready.id });
        yield* client.ArchiveField({ fieldId: effort.id });
        const stale = yield* parse(stored);
        yield* client.DeleteProject({ projectId: project.id });
        const orphaned = yield* Effect.flip(parse(stored));

        expect(stored).toBe(`stage:#${ready.id} effort>3 due<today`);
        expect(renamed).toMatchObject({
          kind: "parsed",
          displayText: "stage:Go effort>3 due<today",
        });
        expect(stale).toMatchObject({
          kind: "invalid",
          errors: [
            expect.objectContaining({ message: "That Stage choice no longer exists." }),
            expect.objectContaining({ message: expect.stringContaining("Unknown field 'effort'") }),
          ],
        });
        expect(orphaned).toMatchObject({
          _tag: "RuleViolation",
          message: "Search project does not exist.",
        });
      }),
    ),
);
