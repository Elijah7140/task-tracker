import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "@effect/vitest";
import { Effect, Layer, type Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { TestClock } from "effect/testing";
import { makeRpcClient } from "../../../web/src/rpc-client.js";
import { databaseLayer } from "../../src/db/database-layer.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../src/rpc/loopback-rpc.js";

const timeZone = "America/New_York";
const rendererOrigin = "http://127.0.0.1:5173";
const efStampUtc = "2026-11-13T12:00:00.1234567Z";
const writeStartedAtUtc = "2026-11-14T12:00:00Z";

const projectId = "019A0000-0000-7000-8000-000000000AAA";
const folderId = "019A0000-0000-7000-8000-000000000BBB";
const childFolderId = "019A0000-0000-7000-8000-000000000BBC";
const parentId = "019A0000-0000-7000-8000-000000000CCA";
const childId = "019A0000-0000-7000-8000-000000000CCB";
const deletedId = "019A0000-0000-7000-8000-000000000CCC";
const efBatchId = "019A0000-0000-7000-8000-000000000DDD";
const archivedTypeId = "019A0000-0000-7000-8000-000000000EEE";
const renamedChangeId = "019A0000-0000-7000-8000-000000000001";
const highPriorityId = "019A0000-0000-7000-8000-000000000102";

const phase3FieldIds = {
  notes: "019A0000-0000-7000-8000-00000000F001",
  estimate: "019A0000-0000-7000-8000-00000000F002",
  reviewDate: "019A0000-0000-7000-8000-00000000F003",
  reviewed: "019A0000-0000-7000-8000-00000000F004",
  status: "019A0000-0000-7000-8000-00000000F005",
  retiredOption: "019A0000-0000-7000-8000-00000000FAAA",
} as const;

const ticks = {
  oneDay: "864000000000",
  twoDays: "1728000000000",
  threeHours: "108000000000",
  halfSecond: "5000000",
  sixHours: "216000000000",
} as const;

const nestedArea = { projectId, folderId: childFolderId };
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

const rendererFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", rendererOrigin);
  return fetch(input, { ...init, headers });
};

type RpcClientHandle = Effect.Success<ReturnType<typeof makeRpcClient>>;

function copyEfFixture(fixture: "initial-create" | "phase-3" | "legacy-final") {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const folder = mkdtempSync(join(tmpdir(), `tasktracker-ef-rpc-${fixture}-`));
      const path = join(folder, "tracker.db");
      copyFileSync(new URL(`../fixtures/ef/${fixture}.db`, import.meta.url), path);
      return { folder, path };
    }),
    ({ folder }) => Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
  );
}

function openFixtureRpc<Value, Error>(
  path: string,
  run: (client: RpcClientHandle) => Effect.Effect<Value, Error, Scope.Scope>,
) {
  const layer = loopbackRpcLayer({ rendererOrigin, timeZone }).pipe(
    Layer.provide(databaseLayer(path)),
  );
  return Effect.scoped(
    LoopbackRpc.pipe(
      Effect.flatMap(makeRpcClient),
      Effect.flatMap(run),
      Effect.provide(layer),
      Effect.provideService(FetchHttpClient.Fetch, rendererFetch),
    ),
  );
}

/** The fixtures store no reminder settings, so the defaults apply (§7.12). */
const DEFAULT_REMINDERS = {
  remindersEnabled: true,
  defaultReminderOffset: "36000000000",
  dateOnlyReminderTime: "09:00:00",
};

/** {@link DEFAULT_REMINDERS} as a project inherits them. */
const INHERITED_REMINDERS = {
  remindersEnabled: { value: true, source: "Global" },
  defaultReminderOffset: { value: "36000000000", source: "Global" },
  dateOnlyReminderTime: { value: "09:00:00", source: "Global" },
};

function assertSharedFixtureState(
  globalSettings: unknown,
  projectSettings: unknown,
  workspace: unknown,
  area: unknown,
  itemTypes: unknown,
) {
  expect(globalSettings).toEqual({
    autoCompleteParents: true,
    urgencyYellowThreshold: ticks.oneDay,
    urgencyRedThreshold: ticks.threeHours,
    workspaceCardColumns: 4,
    reminders: DEFAULT_REMINDERS,
    keepRunningInTray: false,
    addOpensDetails: { todo: false, ticket: false },
    startWithSystem: false,
  });
  expect(projectSettings).toEqual({
    projectId,
    autoCompleteParents: { value: true, source: "Global" },
    urgencyYellowThreshold: { value: ticks.oneDay, source: "Global" },
    urgencyRedThreshold: { value: ticks.halfSecond, source: "Project" },
    reminders: INHERITED_REMINDERS,
  });
  expect(workspace).toEqual({
    projectId,
    name: "Sample project",
    folders: [
      {
        id: folderId,
        projectId,
        parentFolderId: null,
        name: "Sample folder",
        sortOrder: 0,
        createdAtUtc: efStampUtc,
        updatedAtUtc: efStampUtc,
      },
      {
        id: childFolderId,
        projectId,
        parentFolderId: folderId,
        name: "Nested folder",
        sortOrder: 0,
        createdAtUtc: efStampUtc,
        updatedAtUtc: efStampUtc,
      },
    ],
  });
  expect(itemTypes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: renamedChangeId,
        name: "Renamed Change",
        isBuiltIn: true,
        isArchived: false,
      }),
      expect.objectContaining({
        id: archivedTypeId,
        name: "Archived type",
        isBuiltIn: false,
        isArchived: true,
      }),
    ]),
  );
  expect(area).toMatchObject({
    projectId,
    folderId: childFolderId,
    items: {
      open: [],
      finished: [
        {
          item: {
            id: parentId,
            title: "Sample parent",
            createdAtUtc: efStampUtc,
            completedAtUtc: efStampUtc,
          },
          isFinished: true,
          children: {
            open: [],
            finished: [
              {
                item: {
                  id: childId,
                  title: "Sample child",
                  itemTypeId: archivedTypeId,
                  priorityLevelId: highPriorityId,
                  dueDate: "2026-12-10",
                  dueTime: "09:30:00.12",
                  scheduledStart: "2026-12-09T14:00:00.1234567",
                  scheduledEnd: "2026-12-09T15:00:00.1234567",
                  completedAtUtc: efStampUtc,
                },
                isFinished: true,
              },
            ],
          },
        },
      ],
    },
  });
}

it.effect(
  "Adopts initial-create.db through loopback RPC, writes across features, and preserves state across reopen",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Temporal.Instant.from(writeStartedAtUtc).epochMilliseconds);
        const { path } = yield* copyEfFixture("initial-create");

        const written = yield* openFixtureRpc(path, (client) =>
          Effect.gen(function* () {
            const globalSettings = yield* client.LoadGlobalSettings();
            const projectSettings = yield* client.LoadProjectSettings({ projectId });
            const workspace = yield* client.LoadWorkspace({ projectId });
            const initialArea = yield* client.LoadArea(nestedArea);
            const itemTypes = yield* client.ListItemTypes();
            const initialFields = yield* client.ListFields({ projectId });
            const initialValues = yield* client.LoadItemFieldValues({ itemId: childId });
            assertSharedFixtureState(
              globalSettings,
              projectSettings,
              workspace,
              initialArea,
              itemTypes,
            );
            expect(initialFields).toEqual([]);
            expect(initialValues).toEqual([]);

            const notes = yield* client.CreateField({
              name: "Notes",
              dataType: "Text",
              projectId: null,
            });
            const estimate = yield* client.CreateField({
              name: "Estimate",
              dataType: "Number",
              projectId,
            });
            const reviewDate = yield* client.CreateField({
              name: "Review date",
              dataType: "Date",
              projectId: null,
            });
            const reviewed = yield* client.CreateField({
              name: "Reviewed",
              dataType: "Boolean",
              projectId: null,
            });
            const status = yield* client.CreateField({
              name: "Status",
              dataType: "Choice",
              projectId: null,
            });
            const retiredChoice = yield* client.AddFieldChoice({
              fieldId: status.id,
              label: "Retired option",
            });
            const activeChoice = yield* client.AddFieldChoice({
              fieldId: status.id,
              label: "Ready",
            });
            const childItem = initialArea.items.finished[0]!.children.finished[0]!.item;
            yield* TestClock.adjust("1 second");
            yield* client.EditItem({
              itemId: childId,
              fields: {
                title: childItem.title,
                description: "Adopted description",
                ticketNumber: "EF-1",
                itemTypeId: childItem.itemTypeId,
                priorityLevelId: childItem.priorityLevelId,
                dueDate: childItem.dueDate,
                dueTime: childItem.dueTime,
                scheduledStart: childItem.scheduledStart,
                scheduledEnd: childItem.scheduledEnd,
              },
              customValues: [
                { fieldDefinitionId: notes.id, textValue: "Adopted text" },
                { fieldDefinitionId: estimate.id, numberValue: 8.5 },
                { fieldDefinitionId: reviewDate.id, dateValue: "2026-12-08" },
                { fieldDefinitionId: reviewed.id, boolValue: true },
                { fieldDefinitionId: status.id, choiceId: retiredChoice.id },
              ],
            });
            yield* client.ArchiveField({ fieldId: notes.id });
            yield* client.ArchiveFieldChoice({ fieldId: status.id, choiceId: retiredChoice.id });

            yield* client.RestoreItems({ ...nestedArea, batchId: efBatchId });
            const reopenedAfterRestore = yield* client.LoadArea(nestedArea);
            const reopenedParent = reopenedAfterRestore.items.open[0];
            expect(reopenedParent?.item.completedAtUtc).toBeNull();
            expect(reopenedParent?.children.open.map(({ item }) => item.id)).toEqual([deletedId]);
            expect(reopenedParent?.children.finished.map(({ item }) => item.id)).toEqual([childId]);
            yield* TestClock.adjust("1 second");
            const completedRestored = yield* client.SetItemCompleted({
              ...nestedArea,
              itemId: deletedId,
              completed: true,
            });
            expect(completedRestored.kind).toBe("applied");

            const addedFolder = yield* client.CreateFolder({
              projectId,
              parentFolderId: folderId,
              name: "Adopted folder",
            });
            const addedArea = { projectId, folderId: addedFolder.id };
            const branchParent = yield* client.CreateItem({
              ...addedArea,
              parentItemId: null,
              title: "Branch parent",
            });
            const branchChild = yield* client.CreateItem({
              ...addedArea,
              parentItemId: branchParent.id,
              title: "Branch child",
            });
            const completionPreview = yield* client.SetItemCompleted({
              ...addedArea,
              itemId: branchParent.id,
              completed: true,
            });
            expect(completionPreview.kind).toBe("needs-confirmation");
            if (completionPreview.kind !== "needs-confirmation") {
              throw new Error("Expected confirmation for open sub-item.");
            }
            yield* client.SetItemCompleted({
              ...addedArea,
              itemId: branchParent.id,
              completed: true,
              confirmedOpenItemIds: completionPreview.openSubItemIds,
            });
            const batchTarget = yield* client.CreateItem({
              ...addedArea,
              parentItemId: null,
              title: "Batch deleted",
            });
            const newBatchId = yield* client.DeleteItem({
              ...addedArea,
              itemId: batchTarget.id,
            });

            const customPriority = yield* client.AddPriorityLevel({ name: "Deferred" });
            yield* client.ArchivePriorityLevel({ id: customPriority.id });
            yield* client.SaveProjectSettings({
              projectId,
              overrides: {
                autoCompleteParents: null,
                urgencyYellowThreshold: ticks.twoDays,
                urgencyRedThreshold: ticks.halfSecond,
              },
            });

            return {
              notes,
              estimate,
              reviewDate,
              reviewed,
              status,
              retiredChoice,
              activeChoice,
              addedFolder,
              branchParent,
              branchChild,
              batchTarget,
              newBatchId,
              customPriority,
            };
          }),
        );

        yield* TestClock.adjust("5 seconds");
        yield* openFixtureRpc(path, (client) =>
          Effect.gen(function* () {
            const globalSettings = yield* client.LoadGlobalSettings();
            const projectSettings = yield* client.LoadProjectSettings({ projectId });
            const workspace = yield* client.LoadWorkspace({ projectId });
            const nested = yield* client.LoadArea(nestedArea);
            const addedArea = { projectId, folderId: written.addedFolder.id };
            const addedBeforeRestore = yield* client.LoadArea(addedArea);
            yield* client.RestoreItems({ ...addedArea, batchId: written.newBatchId });
            const addedAfterRestore = yield* client.LoadArea(addedArea);
            const childValues = yield* client.LoadItemFieldValues({ itemId: childId });
            const effectiveFields = yield* client.ListEffectiveFields({ projectId });
            const managedFields = yield* client.ListFields({ projectId });
            const choices = yield* client.ListFieldChoices({ fieldId: written.status.id });
            const itemTypes = yield* client.ListItemTypes();
            const priorities = yield* client.ListPriorityLevels();

            expect(globalSettings).toEqual({
              autoCompleteParents: true,
              urgencyYellowThreshold: ticks.oneDay,
              urgencyRedThreshold: ticks.threeHours,
              workspaceCardColumns: 4,
              reminders: DEFAULT_REMINDERS,
              keepRunningInTray: false,
              startWithSystem: false,
              addOpensDetails: { todo: false, ticket: false },
            });
            expect(projectSettings).toEqual({
              projectId,
              autoCompleteParents: { value: true, source: "Global" },
              urgencyYellowThreshold: { value: ticks.twoDays, source: "Project" },
              urgencyRedThreshold: { value: ticks.halfSecond, source: "Project" },
              reminders: INHERITED_REMINDERS,
            });
            expect(workspace.folders.map(({ id }) => id)).toEqual([
              folderId,
              childFolderId,
              written.addedFolder.id,
            ]);
            expect(nested.items.finished[0]).toMatchObject({
              item: {
                id: parentId,
                createdAtUtc: efStampUtc,
                completedAtUtc: "2026-11-14T12:00:02Z",
              },
              isFinished: true,
              children: {
                open: [],
                finished: [
                  {
                    item: {
                      id: deletedId,
                      deletedAtUtc: null,
                      deletionBatchId: null,
                      completedAtUtc: "2026-11-14T12:00:02Z",
                    },
                  },
                  {
                    item: {
                      id: childId,
                      description: "Adopted description",
                      ticketNumber: "EF-1",
                      itemTypeId: archivedTypeId,
                      priorityLevelId: highPriorityId,
                      dueDate: "2026-12-10",
                      dueTime: "09:30:00.12",
                      scheduledStart: "2026-12-09T14:00:00.1234567",
                      scheduledEnd: "2026-12-09T15:00:00.1234567",
                      updatedAtUtc: "2026-11-14T12:00:01Z",
                    },
                  },
                ],
              },
            });
            expect(addedBeforeRestore.items.open).toEqual([]);
            expect(addedBeforeRestore.items.finished).toMatchObject([
              {
                item: { id: written.branchParent.id, completedAtUtc: "2026-11-14T12:00:02Z" },
                isFinished: true,
                children: { finished: [{ item: { id: written.branchChild.id } }] },
              },
            ]);
            expect(addedAfterRestore.items.open.map(({ item }) => item.id)).toEqual([
              written.batchTarget.id,
            ]);
            expect(addedAfterRestore.items.finished.map(({ item }) => item.id)).toEqual([
              written.branchParent.id,
            ]);
            expect(effectiveFields.map(({ id }) => id)).toEqual([
              written.reviewDate.id,
              written.reviewed.id,
              written.status.id,
              written.estimate.id,
            ]);
            expect(managedFields).toContainEqual({ ...written.notes, isArchived: true });
            expect(choices).toEqual([
              { ...written.retiredChoice, isArchived: true },
              written.activeChoice,
            ]);
            expect(childValues).toEqual([
              {
                itemId: childId,
                fieldDefinitionId: written.notes.id,
                textValue: "Adopted text",
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: written.estimate.id,
                textValue: null,
                numberValue: 8.5,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: written.reviewDate.id,
                textValue: null,
                numberValue: null,
                dateValue: "2026-12-08",
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: written.reviewed.id,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: true,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: written.status.id,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: written.retiredChoice.id,
              },
            ]);
            expect(itemTypes).toContainEqual(
              expect.objectContaining({ id: renamedChangeId, name: "Renamed Change" }),
            );
            expect(itemTypes).toContainEqual(
              expect.objectContaining({ id: archivedTypeId, isArchived: true }),
            );
            expect(priorities).toContainEqual({ ...written.customPriority, isArchived: true });
          }),
        );
      }),
    ),
);

it.effect(
  "Opens phase-3.db through loopback RPC, edits custom fields and values, and preserves state across reopen",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Temporal.Instant.from(writeStartedAtUtc).epochMilliseconds);
        const { path } = yield* copyEfFixture("phase-3");

        const written = yield* openFixtureRpc(path, (client) =>
          Effect.gen(function* () {
            const globalSettings = yield* client.LoadGlobalSettings();
            const projectSettings = yield* client.LoadProjectSettings({ projectId });
            const workspace = yield* client.LoadWorkspace({ projectId });
            const initialArea = yield* client.LoadArea(nestedArea);
            const itemTypes = yield* client.ListItemTypes();
            const managedFields = yield* client.ListFields({ projectId });
            const effectiveFields = yield* client.ListEffectiveFields({ projectId });
            const initialChoices = yield* client.ListFieldChoices({
              fieldId: phase3FieldIds.status,
            });
            const initialValues = yield* client.LoadItemFieldValues({ itemId: childId });
            assertSharedFixtureState(
              globalSettings,
              projectSettings,
              workspace,
              initialArea,
              itemTypes,
            );
            expect(managedFields.map(({ id }) => id)).toEqual([
              phase3FieldIds.notes,
              phase3FieldIds.estimate,
              phase3FieldIds.reviewDate,
              phase3FieldIds.reviewed,
              phase3FieldIds.status,
            ]);
            expect(effectiveFields.map(({ id }) => id)).toEqual([
              phase3FieldIds.reviewDate,
              phase3FieldIds.reviewed,
              phase3FieldIds.status,
              phase3FieldIds.estimate,
            ]);
            expect(initialChoices).toEqual([
              {
                id: phase3FieldIds.retiredOption,
                fieldDefinitionId: phase3FieldIds.status,
                label: "Retired option",
                sortOrder: 0,
                isArchived: true,
              },
            ]);
            expect(initialValues).toEqual([
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.notes,
                textValue: "Example text",
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.estimate,
                textValue: null,
                numberValue: 12.5,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.reviewDate,
                textValue: null,
                numberValue: null,
                dateValue: "2026-12-08",
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.reviewed,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: false,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.status,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: phase3FieldIds.retiredOption,
              },
            ]);

            const blockedTypeChange = yield* Effect.flip(
              client.ChangeFieldType({ fieldId: phase3FieldIds.estimate, dataType: "Text" }),
            );
            const blockedArchivedWrite = yield* Effect.flip(
              client.EditItem({
                itemId: parentId,
                fields: { ...blankFields, title: "Sample parent" },
                customValues: [{ fieldDefinitionId: phase3FieldIds.notes, textValue: "blocked" }],
              }),
            );
            expect(blockedTypeChange).toMatchObject({ _tag: "RuleViolation" });
            expect(blockedArchivedWrite).toMatchObject({ _tag: "RuleViolation" });

            const activeChoice = yield* client.AddFieldChoice({
              fieldId: phase3FieldIds.status,
              label: "In Review",
            });
            yield* client.ReorderFieldChoices({
              fieldId: phase3FieldIds.status,
              choiceIds: [activeChoice.id, phase3FieldIds.retiredOption],
            });
            yield* client.RenameField({ fieldId: phase3FieldIds.estimate, name: "Effort" });
            const activeSummary = yield* client.CreateField({
              name: "Summary",
              dataType: "Text",
              projectId,
            });
            const childItem = initialArea.items.finished[0]!.children.finished[0]!.item;
            yield* TestClock.adjust("1 second");
            yield* client.EditItem({
              itemId: childId,
              fields: {
                title: "Updated child",
                description: null,
                ticketNumber: "P3-9",
                itemTypeId: childItem.itemTypeId,
                priorityLevelId: childItem.priorityLevelId,
                dueDate: childItem.dueDate,
                dueTime: childItem.dueTime,
                scheduledStart: childItem.scheduledStart,
                scheduledEnd: childItem.scheduledEnd,
              },
              customValues: [
                { fieldDefinitionId: phase3FieldIds.estimate, numberValue: 21.75 },
                { fieldDefinitionId: phase3FieldIds.reviewDate, dateValue: "2026-12-15" },
                { fieldDefinitionId: phase3FieldIds.reviewed, boolValue: true },
                {
                  fieldDefinitionId: phase3FieldIds.status,
                  choiceId: phase3FieldIds.retiredOption,
                },
              ],
            });
            yield* client.EditItem({
              itemId: parentId,
              fields: { ...blankFields, title: "Sample parent" },
              customValues: [
                { fieldDefinitionId: activeSummary.id, textValue: "Parent summary" },
                { fieldDefinitionId: phase3FieldIds.status, choiceId: activeChoice.id },
              ],
            });

            yield* client.RestoreItems({ ...nestedArea, batchId: efBatchId });
            const reopenedArea = yield* client.LoadArea(nestedArea);
            expect(reopenedArea.items.open[0]?.item.completedAtUtc).toBeNull();
            yield* TestClock.adjust("1 second");
            const preview = yield* client.SetItemCompleted({
              ...nestedArea,
              itemId: parentId,
              completed: true,
            });
            expect(preview).toEqual({
              kind: "needs-confirmation",
              openSubItemCount: 1,
              openSubItemIds: [deletedId],
            });
            if (preview.kind !== "needs-confirmation") {
              throw new Error("Expected confirmation for restored child.");
            }
            yield* client.SetItemCompleted({
              ...nestedArea,
              itemId: parentId,
              completed: true,
              confirmedOpenItemIds: preview.openSubItemIds,
            });

            const newFolder = yield* client.CreateFolder({
              projectId,
              parentFolderId: null,
              name: "Phase 3 follow-up",
            });
            const newArea = { projectId, folderId: newFolder.id };
            const batchItem = yield* client.CreateItem({
              ...newArea,
              parentItemId: null,
              title: "Pending restore",
            });
            const newBatchId = yield* client.DeleteItem({ ...newArea, itemId: batchItem.id });

            const newType = yield* client.AddItemType({ name: "Follow-up" });
            yield* client.ArchiveItemType({ id: newType.id });
            yield* client.SaveGlobalSettings({
              settings: {
                autoCompleteParents: true,
                urgencyYellowThreshold: ticks.twoDays,
                urgencyRedThreshold: ticks.sixHours,
                workspaceCardColumns: 4,
                reminders: DEFAULT_REMINDERS,
              },
            });

            return { activeChoice, activeSummary, newFolder, batchItem, newBatchId, newType };
          }),
        );

        yield* TestClock.adjust("5 seconds");
        yield* openFixtureRpc(path, (client) =>
          Effect.gen(function* () {
            const globalSettings = yield* client.LoadGlobalSettings();
            const projectSettings = yield* client.LoadProjectSettings({ projectId });
            const workspace = yield* client.LoadWorkspace({ projectId });
            const nested = yield* client.LoadArea(nestedArea);
            const newArea = { projectId, folderId: written.newFolder.id };
            const deletedArea = yield* client.LoadArea(newArea);
            yield* client.RestoreItems({ ...newArea, batchId: written.newBatchId });
            const restoredArea = yield* client.LoadArea(newArea);
            const childValues = yield* client.LoadItemFieldValues({ itemId: childId });
            const parentValues = yield* client.LoadItemFieldValues({ itemId: parentId });
            const managedFields = yield* client.ListFields({ projectId });
            const choices = yield* client.ListFieldChoices({ fieldId: phase3FieldIds.status });
            const itemTypes = yield* client.ListItemTypes();

            expect(globalSettings).toEqual({
              autoCompleteParents: true,
              urgencyYellowThreshold: ticks.twoDays,
              urgencyRedThreshold: ticks.sixHours,
              workspaceCardColumns: 4,
              reminders: DEFAULT_REMINDERS,
              keepRunningInTray: false,
              startWithSystem: false,
              addOpensDetails: { todo: false, ticket: false },
            });
            expect(projectSettings).toEqual({
              projectId,
              autoCompleteParents: { value: true, source: "Global" },
              urgencyYellowThreshold: { value: ticks.twoDays, source: "Global" },
              urgencyRedThreshold: { value: ticks.halfSecond, source: "Project" },
              reminders: INHERITED_REMINDERS,
            });
            expect(workspace.folders.map(({ id }) => id)).toEqual([
              folderId,
              childFolderId,
              written.newFolder.id,
            ]);
            expect(nested.items.finished[0]).toMatchObject({
              item: {
                id: parentId,
                createdAtUtc: efStampUtc,
                completedAtUtc: "2026-11-14T12:00:02Z",
              },
              isFinished: true,
              children: {
                open: [],
                finished: [
                  {
                    item: {
                      id: deletedId,
                      deletedAtUtc: null,
                      deletionBatchId: null,
                      completedAtUtc: "2026-11-14T12:00:02Z",
                    },
                  },
                  {
                    item: {
                      id: childId,
                      title: "Updated child",
                      ticketNumber: "P3-9",
                      itemTypeId: archivedTypeId,
                      priorityLevelId: highPriorityId,
                      dueDate: "2026-12-10",
                      dueTime: "09:30:00.12",
                      scheduledStart: "2026-12-09T14:00:00.1234567",
                      scheduledEnd: "2026-12-09T15:00:00.1234567",
                      completedAtUtc: efStampUtc,
                      updatedAtUtc: "2026-11-14T12:00:01Z",
                    },
                  },
                ],
              },
            });
            expect(deletedArea.items).toEqual({ open: [], finished: [] });
            expect(restoredArea.items.open.map(({ item }) => item.id)).toEqual([
              written.batchItem.id,
            ]);
            expect(managedFields).toContainEqual({
              id: phase3FieldIds.estimate,
              key: "estimate",
              displayName: "Effort",
              dataType: "Number",
              projectId,
              isArchived: false,
              sortOrder: 1,
            });
            expect(choices).toEqual([
              { ...written.activeChoice, sortOrder: 0 },
              {
                id: phase3FieldIds.retiredOption,
                fieldDefinitionId: phase3FieldIds.status,
                label: "Retired option",
                sortOrder: 1,
                isArchived: true,
              },
            ]);
            expect(childValues).toEqual([
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.notes,
                textValue: "Example text",
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.estimate,
                textValue: null,
                numberValue: 21.75,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.reviewDate,
                textValue: null,
                numberValue: null,
                dateValue: "2026-12-15",
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.reviewed,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: true,
                choiceId: null,
              },
              {
                itemId: childId,
                fieldDefinitionId: phase3FieldIds.status,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: phase3FieldIds.retiredOption,
              },
            ]);
            expect(parentValues).toEqual([
              {
                itemId: parentId,
                fieldDefinitionId: written.activeSummary.id,
                textValue: "Parent summary",
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: null,
              },
              {
                itemId: parentId,
                fieldDefinitionId: phase3FieldIds.status,
                textValue: null,
                numberValue: null,
                dateValue: null,
                boolValue: null,
                choiceId: written.activeChoice.id,
              },
            ]);
            expect(itemTypes).toContainEqual({ ...written.newType, isArchived: true });
          }),
        );
      }),
    ),
);

interface FixtureNode {
  readonly item: { readonly id: string; readonly title: string };
  readonly children: FixtureBranch;
}
interface FixtureBranch {
  readonly open: ReadonlyArray<FixtureNode>;
  readonly finished: ReadonlyArray<FixtureNode>;
}

/** The raw EF creation time of a link, read outside the server. */
function readLinkCreatedAt(path: string, linkId: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const row = database.prepare("SELECT CreatedAtUtc FROM ItemLink WHERE Id = ?").get(linkId);
    return row?.["CreatedAtUtc"];
  } finally {
    database.close();
  }
}

function findFixtureItem(branch: FixtureBranch, id: string): FixtureNode["item"] | undefined {
  for (const node of [...branch.open, ...branch.finished]) {
    const found = node.item.id === id ? node.item : findFixtureItem(node.children, id);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

it.effect("Opens legacy-final.db links, saves a new list and keeps the stored link row", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Temporal.Instant.from(writeStartedAtUtc).epochMilliseconds);
      const { path } = yield* copyEfFixture("legacy-final");
      const storedLinkId = "019A0000-0000-7000-8000-000000000FFB";

      const initial = yield* openFixtureRpc(path, (client) =>
        Effect.gen(function* () {
          const links = yield* client.LoadItemLinks({ itemId: childId });
          const area = yield* client.LoadArea(nestedArea);
          const title = findFixtureItem(area.items, childId)?.title ?? "";
          yield* client.EditItem({
            itemId: childId,
            fields: { ...blankFields, title },
            links: [
              { id: null, url: "mailto:dba@example.test", title: "DBA" },
              { id: storedLinkId.toLowerCase(), url: "https://example.test/guide", title: null },
            ],
          });
          return links;
        }),
      );
      const reopened = yield* openFixtureRpc(path, (client) =>
        client.LoadItemLinks({ itemId: childId }),
      );

      expect(initial).toEqual([
        { id: storedLinkId, url: "https://example.test/guide", title: "Sample link", sortOrder: 0 },
      ]);
      expect(reopened).toMatchObject([
        { url: "mailto:dba@example.test", title: "DBA", sortOrder: 0 },
        { id: storedLinkId, url: "https://example.test/guide", title: null, sortOrder: 1 },
      ]);
      expect(readLinkCreatedAt(path, storedLinkId)).toBe("2026-11-13 12:00:00.1234567");
    }),
  ),
);

it.effect("Opens legacy-final.db saved searches, renames one and keeps its definition", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Temporal.Instant.from(writeStartedAtUtc).epochMilliseconds);
      const { path } = yield* copyEfFixture("legacy-final");
      const storedId = "019A0000-0000-7000-8000-000000000FFA";

      const initial = yield* openFixtureRpc(path, (client) =>
        Effect.gen(function* () {
          const listed = yield* client.ListSavedSearches();
          yield* client.RenameSavedSearch({ savedSearchId: storedId, name: "Sample done" });
          return listed;
        }),
      );
      const reopened = yield* openFixtureRpc(path, (client) => client.ListSavedSearches());

      const definition = {
        queryText: "completed:completed",
        scope: { kind: "project", projectId },
        includeCompleted: true,
      };
      expect(initial).toEqual([{ id: storedId, name: "Completed in sample", ...definition }]);
      expect(reopened).toEqual([{ id: storedId, name: "Sample done", ...definition }]);
    }),
  ),
);
