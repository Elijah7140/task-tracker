import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const blankFields = {
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
  scheduledStart: null,
  scheduledEnd: null,
};

const setupProject = Effect.gen(function* () {
  const client = yield* connectRenderer;
  const project = yield* client.CreateProject({ name: "Billing DB" });
  const area = { projectId: project.id, folderId: null };
  return { client, project, area };
});

it.effect(
  "Creates, renames, changes unused types, archives, restores, and reorders scoped fields",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const { client, project } = yield* setupProject;
        const other = yield* client.CreateProject({ name: "Other" });

        const global = yield* client.CreateField({
          name: " Impact ",
          dataType: "Text",
          projectId: null,
        });
        const local = yield* client.CreateField({
          name: " Estimate ",
          dataType: "Text",
          projectId: project.id.toLowerCase(),
        });
        const archived = yield* client.CreateField({
          name: "Retired",
          dataType: "Boolean",
          projectId: project.id,
        });
        yield* client.CreateField({
          name: "Estimate",
          dataType: "Number",
          projectId: other.id,
        });
        yield* client.ChangeFieldType({ fieldId: local.id.toLowerCase(), dataType: "Number" });
        yield* client.RenameField({ fieldId: local.id, name: "Effort" });
        yield* client.ArchiveField({ fieldId: archived.id.toLowerCase() });
        const collision = yield* client.CreateField({
          name: "Retired",
          dataType: "Date",
          projectId: project.id,
        });
        yield* client.ReorderFields({
          projectId: project.id.toLowerCase(),
          fieldIds: [collision.id.toLowerCase(), archived.id, local.id],
        });
        const managed = yield* client.ListFields({ projectId: project.id.toLowerCase() });
        const effective = yield* client.ListEffectiveFields({
          projectId: project.id.toLowerCase(),
        });
        yield* client.ArchiveField({ fieldId: collision.id });
        yield* client.RestoreField({ fieldId: archived.id.toLowerCase() });
        const restoredEffective = yield* client.ListEffectiveFields({ projectId: project.id });

        expect(global).toEqual({
          id: expect.stringMatching(/^[0-9A-F-]{36}$/),
          key: "impact",
          displayName: "Impact",
          dataType: "Text",
          projectId: null,
          isArchived: false,
          sortOrder: 0,
        });
        expect(local.id).toMatch(/^[0-9A-F-]{36}$/);
        expect(local.projectId).toBe(project.id);
        expect(collision.key).toBe("retired-2");
        expect(managed).toEqual([
          global,
          { ...collision, sortOrder: 0 },
          { ...archived, isArchived: true, sortOrder: 1 },
          { ...local, displayName: "Effort", dataType: "Number", sortOrder: 2 },
        ]);
        expect(effective).toEqual([
          global,
          { ...collision, sortOrder: 0 },
          { ...local, displayName: "Effort", dataType: "Number", sortOrder: 2 },
        ]);
        expect(restoredEffective).toEqual([
          global,
          { ...archived, isArchived: false, sortOrder: 1 },
          { ...local, displayName: "Effort", dataType: "Number", sortOrder: 2 },
        ]);
      }),
    ),
);

it.effect("Rejects conflicting field rules and reports missing projects or fields", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, project } = yield* setupProject;
      const missingId = "0190A1B2-0000-7000-8000-000000000999";
      const global = yield* client.CreateField({
        name: "Impact",
        dataType: "Text",
        projectId: null,
      });
      const local = yield* client.CreateField({
        name: "Local",
        dataType: "Text",
        projectId: project.id,
      });
      const deletedProject = yield* client.CreateProject({ name: "Deleted" });
      yield* client.DeleteProject({ projectId: deletedProject.id });

      const crossScope = yield* Effect.flip(
        client.CreateField({ name: "IMPACT", dataType: "Text", projectId: project.id }),
      );
      const renameClash = yield* Effect.flip(
        client.RenameField({ fieldId: local.id, name: " impact " }),
      );
      const wrongScopeOrder = yield* Effect.flip(
        client.ReorderFields({ projectId: project.id, fieldIds: [local.id, global.id] }),
      );
      const partialOrder = yield* Effect.flip(
        client.ReorderFields({ projectId: project.id, fieldIds: [] }),
      );
      const missingProject = yield* Effect.flip(
        client.CreateField({ name: "Orphan", dataType: "Text", projectId: deletedProject.id }),
      );
      const missingRename = yield* Effect.flip(
        client.RenameField({ fieldId: missingId, name: "Missing" }),
      );
      const missingType = yield* Effect.flip(
        client.ChangeFieldType({ fieldId: missingId, dataType: "Date" }),
      );
      const missingArchive = yield* Effect.flip(client.ArchiveField({ fieldId: missingId }));
      const missingRestore = yield* Effect.flip(client.RestoreField({ fieldId: missingId }));

      expect(crossScope).toMatchObject({
        _tag: "RuleViolation",
        message: "Field name is already visible in this project.",
      });
      expect(renameClash).toMatchObject({
        _tag: "RuleViolation",
        message: "Field name is already visible in this project.",
      });
      expect(wrongScopeOrder).toMatchObject({ _tag: "RuleViolation" });
      expect(partialOrder).toMatchObject({ _tag: "RuleViolation" });
      expect(missingProject).toMatchObject({ _tag: "NotFound", entity: "Project" });
      expect(missingRename).toMatchObject({ _tag: "NotFound", entity: "Field" });
      expect(missingType).toMatchObject({ _tag: "NotFound", entity: "Field" });
      expect(missingArchive).toMatchObject({ _tag: "NotFound", entity: "Field" });
      expect(missingRestore).toMatchObject({ _tag: "NotFound", entity: "Field" });
    }),
  ),
);

it.effect("Manages choices, enforces choice rules, and identifies missing fields or choices", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const missingId = "0190A1B2-0000-7000-8000-000000000999";
      const textField = yield* client.CreateField({
        name: "Notes",
        dataType: "Text",
        projectId: null,
      });
      const choiceField = yield* client.CreateField({
        name: "Status",
        dataType: "Choice",
        projectId: null,
      });
      const otherChoiceField = yield* client.CreateField({
        name: "Stage",
        dataType: "Choice",
        projectId: null,
      });
      const archivedChoiceField = yield* client.CreateField({
        name: "ArchivedStatus",
        dataType: "Choice",
        projectId: null,
      });
      yield* client.ArchiveField({ fieldId: archivedChoiceField.id });

      const first = yield* client.AddFieldChoice({
        fieldId: choiceField.id.toLowerCase(),
        label: " Open ",
      });
      const second = yield* client.AddFieldChoice({ fieldId: choiceField.id, label: "Closed" });
      const foreign = yield* client.AddFieldChoice({
        fieldId: otherChoiceField.id,
        label: "Foreign",
      });
      yield* client.ArchiveFieldChoice({
        fieldId: choiceField.id.toLowerCase(),
        choiceId: first.id.toLowerCase(),
      });
      yield* client.RenameFieldChoice({
        fieldId: choiceField.id,
        choiceId: second.id.toLowerCase(),
        label: "Open",
      });
      const restoreClash = yield* Effect.flip(
        client.RestoreFieldChoice({ fieldId: choiceField.id, choiceId: first.id }),
      );
      yield* client.RenameFieldChoice({
        fieldId: choiceField.id,
        choiceId: second.id,
        label: "Done",
      });
      yield* client.ReorderFieldChoices({
        fieldId: choiceField.id.toLowerCase(),
        choiceIds: [second.id.toLowerCase(), first.id],
      });
      yield* client.RestoreFieldChoice({ fieldId: choiceField.id, choiceId: first.id });
      const listed = yield* client.ListFieldChoices({ fieldId: choiceField.id.toLowerCase() });
      const wrongType = yield* Effect.flip(
        client.AddFieldChoice({ fieldId: textField.id, label: "Invalid" }),
      );
      const archivedFieldAdd = yield* Effect.flip(
        client.AddFieldChoice({ fieldId: archivedChoiceField.id, label: "Invalid" }),
      );
      const duplicateAdd = yield* Effect.flip(
        client.AddFieldChoice({ fieldId: choiceField.id, label: "OPEN" }),
      );
      const wrongFieldOrder = yield* Effect.flip(
        client.ReorderFieldChoices({ fieldId: choiceField.id, choiceIds: [second.id, foreign.id] }),
      );
      const missingFieldAdd = yield* Effect.flip(
        client.AddFieldChoice({ fieldId: missingId, label: "Ghost" }),
      );
      const missingChoiceRename = yield* Effect.flip(
        client.RenameFieldChoice({ fieldId: choiceField.id, choiceId: missingId, label: "Ghost" }),
      );
      const wrongFieldChoiceArchive = yield* Effect.flip(
        client.ArchiveFieldChoice({ fieldId: choiceField.id, choiceId: foreign.id }),
      );
      const missingChoiceRestore = yield* Effect.flip(
        client.RestoreFieldChoice({ fieldId: choiceField.id, choiceId: missingId }),
      );

      expect(listed).toEqual([
        { ...second, label: "Done", sortOrder: 0, isArchived: false },
        { ...first, label: "Open", sortOrder: 1, isArchived: false },
      ]);
      expect(restoreClash).toMatchObject({
        _tag: "RuleViolation",
        message: "Choice label is already used by this field.",
      });
      expect(wrongType).toMatchObject({
        _tag: "RuleViolation",
        message: "Choices require an active choice field.",
      });
      expect(archivedFieldAdd).toMatchObject({
        _tag: "RuleViolation",
        message: "Choices require an active choice field.",
      });
      expect(duplicateAdd).toMatchObject({ _tag: "RuleViolation" });
      expect(wrongFieldOrder).toMatchObject({ _tag: "RuleViolation" });
      expect(missingFieldAdd).toMatchObject({ _tag: "NotFound", entity: "Field" });
      expect(missingChoiceRename).toMatchObject({ _tag: "NotFound", entity: "Choice" });
      expect(wrongFieldChoiceArchive).toMatchObject({ _tag: "NotFound", entity: "Choice" });
      expect(missingChoiceRestore).toMatchObject({ _tag: "NotFound", entity: "Choice" });
    }),
  ),
);

it.effect(
  "Saves all five custom value types atomically, preserves omitted values, clears blank or null, and keeps unchanged archived values",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const { client, area } = yield* setupProject;
        const text = yield* client.CreateField({ name: "Text", dataType: "Text", projectId: null });
        const number = yield* client.CreateField({
          name: "Number",
          dataType: "Number",
          projectId: null,
        });
        const date = yield* client.CreateField({ name: "Date", dataType: "Date", projectId: null });
        const boolean = yield* client.CreateField({
          name: "Boolean",
          dataType: "Boolean",
          projectId: null,
        });
        const choiceField = yield* client.CreateField({
          name: "Status",
          dataType: "Choice",
          projectId: null,
        });
        const choice = yield* client.AddFieldChoice({ fieldId: choiceField.id, label: "Ready" });
        const archivedField = yield* client.CreateField({
          name: "Legacy",
          dataType: "Text",
          projectId: null,
        });
        const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Original" });
        yield* TestClock.adjust("1 second");

        yield* client.EditItem({
          itemId: item.id.toLowerCase(),
          fields: { ...blankFields, title: "Saved all five" },
          customValues: [
            { fieldDefinitionId: text.id.toLowerCase(), textValue: " trimmed " },
            { fieldDefinitionId: number.id, numberValue: 0 },
            { fieldDefinitionId: date.id, dateValue: "2026-12-08" },
            { fieldDefinitionId: boolean.id, boolValue: false },
            { fieldDefinitionId: choiceField.id, choiceId: choice.id.toLowerCase() },
            { fieldDefinitionId: archivedField.id, textValue: "archived value" },
          ],
        });
        const allValues = yield* client.LoadItemFieldValues({ itemId: item.id.toLowerCase() });
        yield* client.ArchiveField({ fieldId: archivedField.id });
        yield* client.ArchiveFieldChoice({ fieldId: choiceField.id, choiceId: choice.id });
        yield* TestClock.adjust("1 second");
        yield* client.EditItem({
          itemId: item.id,
          fields: { ...blankFields, title: "Partial edit" },
          customValues: [
            { fieldDefinitionId: text.id, textValue: "   " },
            { fieldDefinitionId: number.id, numberValue: null },
            { fieldDefinitionId: choiceField.id, choiceId: choice.id.toLowerCase() },
          ],
        });
        const afterPartial = yield* client.LoadItemFieldValues({ itemId: item.id });
        const snapshot = yield* client.LoadArea(area);

        expect(allValues).toHaveLength(6);
        expect(allValues).toEqual(
          expect.arrayContaining([
            {
              itemId: item.id,
              fieldDefinitionId: text.id,
              textValue: "trimmed",
              numberValue: null,
              dateValue: null,
              boolValue: null,
              choiceId: null,
            },
            {
              itemId: item.id,
              fieldDefinitionId: number.id,
              textValue: null,
              numberValue: 0,
              dateValue: null,
              boolValue: null,
              choiceId: null,
            },
            {
              itemId: item.id,
              fieldDefinitionId: date.id,
              textValue: null,
              numberValue: null,
              dateValue: "2026-12-08",
              boolValue: null,
              choiceId: null,
            },
            {
              itemId: item.id,
              fieldDefinitionId: boolean.id,
              textValue: null,
              numberValue: null,
              dateValue: null,
              boolValue: false,
              choiceId: null,
            },
            {
              itemId: item.id,
              fieldDefinitionId: choiceField.id,
              textValue: null,
              numberValue: null,
              dateValue: null,
              boolValue: null,
              choiceId: choice.id,
            },
          ]),
        );
        expect(afterPartial.map(({ fieldDefinitionId }) => fieldDefinitionId)).toEqual([
          date.id,
          boolean.id,
          choiceField.id,
          archivedField.id,
        ]);
        expect(snapshot.items.open[0]?.item).toMatchObject({
          id: item.id,
          title: "Partial edit",
          updatedAtUtc: "2026-11-13T12:00:02Z",
        });
      }),
    ),
);

it.effect(
  "Locks field types across deleted items and rolls back failed custom or built-in edits",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const { client, project, area } = yield* setupProject;
        const other = yield* client.CreateProject({ name: "Other" });
        const missingId = "0190A1B2-0000-7000-8000-000000000999";
        const text = yield* client.CreateField({ name: "Text", dataType: "Text", projectId: null });
        const numberField = yield* client.CreateField({
          name: "Number",
          dataType: "Number",
          projectId: null,
        });
        const foreignField = yield* client.CreateField({
          name: "Foreign",
          dataType: "Text",
          projectId: other.id,
        });
        const archivedField = yield* client.CreateField({
          name: "Archived",
          dataType: "Text",
          projectId: null,
        });
        yield* client.ArchiveField({ fieldId: archivedField.id });
        const choiceField = yield* client.CreateField({
          name: "Choice",
          dataType: "Choice",
          projectId: null,
        });
        const otherChoiceField = yield* client.CreateField({
          name: "OtherChoice",
          dataType: "Choice",
          projectId: null,
        });
        const archivedChoice = yield* client.AddFieldChoice({
          fieldId: choiceField.id,
          label: "Retired",
        });
        yield* client.ArchiveFieldChoice({ fieldId: choiceField.id, choiceId: archivedChoice.id });
        const foreignChoice = yield* client.AddFieldChoice({
          fieldId: otherChoiceField.id,
          label: "Foreign",
        });
        const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Original" });
        const doomed = yield* client.CreateItem({ ...area, parentItemId: null, title: "Doomed" });
        yield* client.EditItem({
          itemId: doomed.id,
          fields: { ...blankFields, title: "Doomed" },
          customValues: [{ fieldDefinitionId: text.id, textValue: "kept" }],
        });
        yield* client.DeleteItem({ ...area, itemId: doomed.id });

        const typeLocked = yield* Effect.flip(
          client.ChangeFieldType({ fieldId: text.id, dataType: "Number" }),
        );
        const archivedWrite = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: archivedField.id, textValue: "nope" }],
          }),
        );
        const archivedChoiceWrite = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: choiceField.id, choiceId: archivedChoice.id }],
          }),
        );
        const foreignChoiceWrite = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: choiceField.id, choiceId: foreignChoice.id }],
          }),
        );
        const foreignProjectWrite = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: foreignField.id, textValue: "nope" }],
          }),
        );
        const duplicateField = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [
              { fieldDefinitionId: text.id, textValue: "one" },
              { fieldDefinitionId: text.id, textValue: "two" },
            ],
          }),
        );
        const wrongColumn = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: text.id, numberValue: 1 }],
          }),
        );
        const invalidBuiltIn = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed", dueTime: "09:00" },
            customValues: [{ fieldDefinitionId: text.id, textValue: "rolled back" }],
          }),
        );
        const missingField = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: missingId, textValue: "x" }],
          }),
        );
        const missingChoice = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: choiceField.id, choiceId: missingId }],
          }),
        );
        const deletedLoad = yield* Effect.flip(client.LoadItemFieldValues({ itemId: doomed.id }));
        const deletedEdit = yield* Effect.flip(
          client.EditItem({
            itemId: doomed.id,
            fields: { ...blankFields, title: "Edited" },
            customValues: [{ fieldDefinitionId: text.id, textValue: "nope" }],
          }),
        );
        const nonFinite = yield* Effect.exit(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [{ fieldDefinitionId: numberField.id, numberValue: Number.NaN }],
          }),
        );
        const areaAfter = yield* client.LoadArea({ projectId: project.id, folderId: null });
        const valuesAfter = yield* client.LoadItemFieldValues({ itemId: item.id });

        expect(typeLocked).toMatchObject({
          _tag: "RuleViolation",
          message: "A field with values cannot change type.",
        });
        expect(archivedWrite).toMatchObject({ _tag: "RuleViolation" });
        expect(archivedChoiceWrite).toMatchObject({ _tag: "RuleViolation" });
        expect(foreignChoiceWrite).toMatchObject({ _tag: "RuleViolation" });
        expect(foreignProjectWrite).toMatchObject({ _tag: "RuleViolation" });
        expect(duplicateField).toMatchObject({ _tag: "RuleViolation" });
        expect(wrongColumn).toMatchObject({ _tag: "RuleViolation" });
        expect(invalidBuiltIn).toMatchObject({
          _tag: "RuleViolation",
          message: "Due time requires a due date.",
        });
        expect(missingField).toMatchObject({ _tag: "NotFound", entity: "Field" });
        expect(missingChoice).toMatchObject({ _tag: "NotFound", entity: "Choice" });
        expect(deletedLoad).toMatchObject({ _tag: "NotFound", entity: "Item" });
        expect(deletedEdit).toMatchObject({ _tag: "NotFound", entity: "Item" });
        expect(Exit.isFailure(nonFinite)).toBe(true);
        expect(areaAfter.items.open).toMatchObject([{ item: { id: item.id, title: "Original" } }]);
        expect(valuesAfter).toEqual([]);
      }),
    ),
);

it.effect(
  "Hides SQLite diagnostics and rolls back built-in and custom writes on trigger failure",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const { client, area } = yield* setupProject;
        const kept = yield* client.CreateField({ name: "Kept", dataType: "Text", projectId: null });
        const cleared = yield* client.CreateField({
          name: "Cleared",
          dataType: "Number",
          projectId: null,
        });
        const triggerTarget = yield* client.CreateField({
          name: "Target",
          dataType: "Text",
          projectId: null,
        });
        const item = yield* client.CreateItem({ ...area, parentItemId: null, title: "Original" });
        yield* client.EditItem({
          itemId: item.id,
          fields: { ...blankFields, title: "Original" },
          customValues: [
            { fieldDefinitionId: kept.id, textValue: "old" },
            { fieldDefinitionId: cleared.id, numberValue: 7 },
          ],
        });
        yield* sql`CREATE TRIGGER reject_field_insert BEFORE INSERT ON ItemFieldValue
          WHEN NEW.TextValue = 'reject'
          BEGIN SELECT RAISE(ABORT, 'private sqlite diagnostic'); END`;

        const failure = yield* Effect.flip(
          client.EditItem({
            itemId: item.id,
            fields: { ...blankFields, title: "Changed" },
            customValues: [
              { fieldDefinitionId: cleared.id, numberValue: null },
              { fieldDefinitionId: kept.id, textValue: "new" },
              { fieldDefinitionId: triggerTarget.id, textValue: "reject" },
            ],
          }),
        );
        const areaAfterFailure = yield* client.LoadArea(area);
        const valuesAfterFailure = yield* client.LoadItemFieldValues({ itemId: item.id });
        yield* sql`DROP TRIGGER reject_field_insert`;
        yield* client.EditItem({
          itemId: item.id,
          fields: { ...blankFields, title: "Changed" },
          customValues: [
            { fieldDefinitionId: cleared.id, numberValue: null },
            { fieldDefinitionId: kept.id, textValue: "new" },
            { fieldDefinitionId: triggerTarget.id, textValue: "reject" },
          ],
        });
        const areaAfterRetry = yield* client.LoadArea(area);
        const valuesAfterRetry = yield* client.LoadItemFieldValues({ itemId: item.id });

        expect(failure).toEqual(
          expect.objectContaining({
            _tag: "OperationFailed",
            message: "The operation could not be completed.",
          }),
        );
        expect(areaAfterFailure.items.open).toMatchObject([
          { item: { id: item.id, title: "Original" } },
        ]);
        expect(valuesAfterFailure).toEqual([
          {
            itemId: item.id,
            fieldDefinitionId: kept.id,
            textValue: "old",
            numberValue: null,
            dateValue: null,
            boolValue: null,
            choiceId: null,
          },
          {
            itemId: item.id,
            fieldDefinitionId: cleared.id,
            textValue: null,
            numberValue: 7,
            dateValue: null,
            boolValue: null,
            choiceId: null,
          },
        ]);
        expect(areaAfterRetry.items.open).toMatchObject([
          { item: { id: item.id, title: "Changed" } },
        ]);
        expect(valuesAfterRetry).toEqual([
          {
            itemId: item.id,
            fieldDefinitionId: kept.id,
            textValue: "new",
            numberValue: null,
            dateValue: null,
            boolValue: null,
            choiceId: null,
          },
          {
            itemId: item.id,
            fieldDefinitionId: triggerTarget.id,
            textValue: "reject",
            numberValue: null,
            dateValue: null,
            boolValue: null,
            choiceId: null,
          },
        ]);
      }),
    ),
);
