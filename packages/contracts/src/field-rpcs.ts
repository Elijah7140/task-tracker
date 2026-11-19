import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import {
  FieldChoiceProjection,
  FieldDataType,
  FieldDefinitionProjection,
} from "./field-projection.js";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";

/** Manage custom-field definitions and choices across global and project scopes. */
export const FieldRpcs = RpcGroup.make(
  Rpc.make("ListFields", {
    payload: { projectId: Schema.NullOr(Guid) },
    success: Schema.Array(FieldDefinitionProjection),
    error: RpcOperationError,
  }),
  Rpc.make("ListEffectiveFields", {
    payload: { projectId: Guid },
    success: Schema.Array(FieldDefinitionProjection),
    error: RpcOperationError,
  }),
  Rpc.make("CreateField", {
    payload: { name: Schema.String, dataType: FieldDataType, projectId: Schema.NullOr(Guid) },
    success: FieldDefinitionProjection,
    error: RpcOperationError,
  }),
  Rpc.make("RenameField", {
    payload: { fieldId: Guid, name: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("ChangeFieldType", {
    payload: { fieldId: Guid, dataType: FieldDataType },
    error: RpcOperationError,
  }),
  Rpc.make("ArchiveField", { payload: { fieldId: Guid }, error: RpcOperationError }),
  Rpc.make("RestoreField", { payload: { fieldId: Guid }, error: RpcOperationError }),
  Rpc.make("ReorderFields", {
    payload: { projectId: Schema.NullOr(Guid), fieldIds: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
  Rpc.make("ListFieldChoices", {
    payload: { fieldId: Guid },
    success: Schema.Array(FieldChoiceProjection),
    error: RpcOperationError,
  }),
  Rpc.make("AddFieldChoice", {
    payload: { fieldId: Guid, label: Schema.String },
    success: FieldChoiceProjection,
    error: RpcOperationError,
  }),
  Rpc.make("RenameFieldChoice", {
    payload: { fieldId: Guid, choiceId: Guid, label: Schema.String },
    error: RpcOperationError,
  }),
  Rpc.make("ArchiveFieldChoice", {
    payload: { fieldId: Guid, choiceId: Guid },
    error: RpcOperationError,
  }),
  Rpc.make("RestoreFieldChoice", {
    payload: { fieldId: Guid, choiceId: Guid },
    error: RpcOperationError,
  }),
  Rpc.make("ReorderFieldChoices", {
    payload: { fieldId: Guid, choiceIds: Schema.Array(Guid) },
    error: RpcOperationError,
  }),
);
