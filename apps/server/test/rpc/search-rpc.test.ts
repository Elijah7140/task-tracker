import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect("Lists fields and choices, runs scoped search, locates items and maps rule errors", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const folder = yield* client.CreateFolder({
        projectId: project.id,
        parentFolderId: null,
        name: "Invoices",
      });
      const severity = yield* client.CreateField({
        name: "Severity",
        dataType: "Choice",
        projectId: project.id,
      });
      const major = yield* client.AddFieldChoice({ fieldId: severity.id, label: "Major" });
      const item = yield* client.CreateItem({
        projectId: project.id,
        folderId: folder.id,
        parentItemId: null,
        title: "Audit invoice",
      });
      yield* client.EditItem({
        itemId: item.id,
        fields: {
          title: "Audit invoice",
          description: null,
          ticketNumber: "BILL-7",
          priorityLevelId: null,
          dueDate: null,
          dueTime: null,
        },
        customValues: [{ fieldDefinitionId: severity.id, choiceId: major.id }],
      });

      const fields = yield* client.ListSearchFields({
        scope: { kind: "project", projectId: project.id.toLowerCase() },
      });
      const severityField = fields.find((candidate) => candidate.key === severity.key)!;
      const choices = yield* client.ListSearchChoices({
        scope: { kind: "project", projectId: project.id },
        fieldKey: severityField.key,
      });
      const results = yield* client.SearchItems({
        query: {
          scope: {
            kind: "area",
            projectId: project.id.toLowerCase(),
            folderId: folder.id.toLowerCase(),
            includeSubfolders: true,
          },
          text: "audit",
          filters: [
            {
              fieldKey: severity.key,
              operator: "equals",
              value: { kind: "choice", id: major.id.toLowerCase() },
            },
          ],
          includeCompleted: false,
        },
      });
      const located = yield* client.LocateSearchItem({ itemId: item.id.toLowerCase() });
      const invalid = yield* Effect.flip(
        client.SearchItems({
          query: {
            scope: { kind: "allProjects" },
            text: null,
            filters: [
              { fieldKey: "missing", operator: "equals", value: { kind: "text", value: "x" } },
            ],
            includeCompleted: true,
          },
        }),
      );

      expect(choices.map((choice) => choice.label)).toEqual(["Major"]);
      expect(results.hasMore).toBe(false);
      expect(results.items).toEqual([
        expect.objectContaining({
          itemId: item.id,
          projectId: project.id,
          folderId: folder.id,
          title: "Audit invoice",
          ticketNumber: "BILL-7",
          location: ["Billing", "Invoices"],
        }),
      ]);
      expect(located).toEqual({ itemId: item.id, projectId: project.id, folderId: folder.id });
      expect(invalid).toMatchObject({
        _tag: "RuleViolation",
        message: "Unknown search field 'missing'.",
      });
    }),
  ),
);
