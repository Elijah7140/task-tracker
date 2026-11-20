import { type FieldDataType, NotFound } from "@task-tracker/contracts";
import { Effect } from "effect";
import type { CustomFieldProjectTarget, FakeCustomFields } from "./fake-custom-fields.js";

type DataType = typeof FieldDataType.Type;
type RecordCall = (tag: string) => Effect.Effect<unknown>;

/** Looks up the project of an active item for scope checks. */
export type ItemProjectLookup = (itemId: string) => Effect.Effect<string, NotFound>;

/** The parts of the fake server store the custom-field handlers need. */
export interface CustomFieldStore extends CustomFieldProjectTarget {
  readonly customFields: FakeCustomFields;
  readonly itemProject: ItemProjectLookup;
}

function fieldReadHandlers(store: CustomFieldStore, record: RecordCall) {
  const data = store.customFields;
  const read = (tag: string) => record(tag).pipe(Effect.andThen(data.readable()));
  return {
    ListFields: ({ projectId }: { readonly projectId: string | null }) =>
      read("ListFields").pipe(Effect.map(() => data.listAll(projectId))),
    ListEffectiveFields: ({ projectId }: { readonly projectId: string }) =>
      read("ListEffectiveFields").pipe(Effect.map(() => data.listEffective(projectId))),
    ListFieldChoices: ({ fieldId }: { readonly fieldId: string }) =>
      read("ListFieldChoices").pipe(
        Effect.andThen(data.requireField(fieldId)),
        Effect.map(() => data.choicesOf(fieldId)),
      ),
    LoadItemFieldValues: ({ itemId }: { readonly itemId: string }) =>
      read("LoadItemFieldValues").pipe(
        Effect.andThen(store.itemProject(itemId)),
        Effect.andThen(data.loadValues(itemId)),
      ),
  };
}

function fieldDefinitionHandlers(store: CustomFieldStore, record: RecordCall) {
  const data = store.customFields;
  return {
    CreateField: (payload: {
      readonly name: string;
      readonly dataType: DataType;
      readonly projectId: string | null;
    }) =>
      record("CreateField").pipe(
        Effect.andThen(payload.projectId === null ? Effect.void : store.find(payload.projectId)),
        Effect.andThen(data.create(payload.name, payload.dataType, payload.projectId)),
      ),
    RenameField: ({ fieldId, name }: { readonly fieldId: string; readonly name: string }) =>
      record("RenameField").pipe(Effect.andThen(data.rename(fieldId, name))),
    ChangeFieldType: (payload: { readonly fieldId: string; readonly dataType: DataType }) =>
      record("ChangeFieldType").pipe(
        Effect.andThen(data.changeType(payload.fieldId, payload.dataType)),
      ),
    ArchiveField: ({ fieldId }: { readonly fieldId: string }) =>
      record("ArchiveField").pipe(Effect.andThen(data.setFieldArchived(fieldId, true))),
    RestoreField: ({ fieldId }: { readonly fieldId: string }) =>
      record("RestoreField").pipe(Effect.andThen(data.setFieldArchived(fieldId, false))),
    ReorderFields: (payload: {
      readonly projectId: string | null;
      readonly fieldIds: ReadonlyArray<string>;
    }) =>
      record("ReorderFields").pipe(
        Effect.andThen(data.reorder(payload.projectId, payload.fieldIds)),
      ),
  };
}

interface ChoiceTarget {
  readonly fieldId: string;
  readonly choiceId: string;
}

function fieldChoiceHandlers(store: CustomFieldStore, record: RecordCall) {
  const data = store.customFields;
  return {
    AddFieldChoice: ({ fieldId, label }: { readonly fieldId: string; readonly label: string }) =>
      record("AddFieldChoice").pipe(Effect.andThen(data.addChoice(fieldId, label))),
    RenameFieldChoice: (payload: ChoiceTarget & { readonly label: string }) =>
      record("RenameFieldChoice").pipe(
        Effect.andThen(data.renameChoice(payload.fieldId, payload.choiceId, payload.label)),
      ),
    ArchiveFieldChoice: ({ fieldId, choiceId }: ChoiceTarget) =>
      record("ArchiveFieldChoice").pipe(
        Effect.andThen(data.setChoiceArchived(fieldId, choiceId, true)),
      ),
    RestoreFieldChoice: ({ fieldId, choiceId }: ChoiceTarget) =>
      record("RestoreFieldChoice").pipe(
        Effect.andThen(data.setChoiceArchived(fieldId, choiceId, false)),
      ),
    ReorderFieldChoices: (payload: {
      readonly fieldId: string;
      readonly choiceIds: ReadonlyArray<string>;
    }) =>
      record("ReorderFieldChoices").pipe(
        Effect.andThen(data.reorderChoices(payload.fieldId, payload.choiceIds)),
      ),
  };
}

/**
 * Builds every custom-field, choice and item-value read handler backed by
 * `store.customFields`, for spreading into the fake server's handler layer.
 * The field manager and the item editor read and write the same records.
 */
export function customFieldHandlers(store: CustomFieldStore, record: RecordCall) {
  return {
    ...fieldReadHandlers(store, record),
    ...fieldDefinitionHandlers(store, record),
    ...fieldChoiceHandlers(store, record),
  };
}
