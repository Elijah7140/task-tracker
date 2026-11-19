import { FieldRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { FieldService } from "../services/field-service.js";
import { mapOperationError } from "./map-operation-error.js";

/** Bind custom-field definition and choice operations to the transactional field service. */
export const fieldRpcHandlers = FieldRpcs.toLayer(
  Effect.gen(function* () {
    const fields = yield* FieldService;
    return FieldRpcs.of({
      ListFields: ({ projectId }) => fields.listAll(projectId).pipe(mapOperationError),
      ListEffectiveFields: ({ projectId }) =>
        fields.listEffective(projectId).pipe(mapOperationError),
      CreateField: ({ name, dataType, projectId }) =>
        fields.create(name, dataType, projectId).pipe(mapOperationError),
      RenameField: ({ fieldId, name }) => fields.rename(fieldId, name).pipe(mapOperationError),
      ChangeFieldType: ({ fieldId, dataType }) =>
        fields.changeType(fieldId, dataType).pipe(mapOperationError),
      ArchiveField: ({ fieldId }) => fields.archive(fieldId).pipe(mapOperationError),
      RestoreField: ({ fieldId }) => fields.restore(fieldId).pipe(mapOperationError),
      ReorderFields: ({ projectId, fieldIds }) =>
        fields.reorder(projectId, fieldIds).pipe(mapOperationError),
      ListFieldChoices: ({ fieldId }) => fields.listChoices(fieldId).pipe(mapOperationError),
      AddFieldChoice: ({ fieldId, label }) =>
        fields.addChoice(fieldId, label).pipe(mapOperationError),
      RenameFieldChoice: ({ fieldId, choiceId, label }) =>
        fields.renameChoice(fieldId, choiceId, label).pipe(mapOperationError),
      ArchiveFieldChoice: ({ fieldId, choiceId }) =>
        fields.archiveChoice(fieldId, choiceId).pipe(mapOperationError),
      RestoreFieldChoice: ({ fieldId, choiceId }) =>
        fields.restoreChoice(fieldId, choiceId).pipe(mapOperationError),
      ReorderFieldChoices: ({ fieldId, choiceIds }) =>
        fields.reorderChoices(fieldId, choiceIds).pipe(mapOperationError),
    });
  }),
).pipe(Layer.provide(FieldService.layer));
