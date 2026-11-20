import {
  archiveChoice,
  archiveField,
  changeFieldType,
  createChoice,
  createField,
  effectiveFields,
  listFields,
  EntityMissing,
  renameChoice,
  renameField,
  reorderChoices,
  reorderFields,
  restoreChoice,
  restoreField,
  type FieldChoice,
  type FieldDataType,
  type FieldDefinition,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { fieldRepository } from "../db/repositories/field-repository.js";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { projectRepository } from "../db/repositories/project-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));
const decodeScope = Schema.decodeEffect(Schema.NullOr(Guid));

function requireById<Row extends { readonly id: string }>(
  rows: readonly Row[],
  id: string,
  entity: "Field" | "Choice",
) {
  const row = rows.find((candidate) => candidate.id === id);
  return row === undefined
    ? Effect.fail(new EntityMissing(entity, `${entity} was not found.`))
    : Effect.succeed(row);
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = projectRepository(sql);
  const { definitions, choices } = fieldRepository(sql);
  const itemValues = itemFieldValueRepository(sql);
  const undo = yield* UndoService;

  /** Records one field definition row under the legacy label. */
  const captureField = (verb: string, field: FieldDefinition) =>
    undo.capture(undoLabel(`${verb} field`, field.displayName), [
      { table: "FieldDefinition", where: sql`Id = ${field.id}` },
    ]);

  /** Records one choice row under the legacy label. */
  const captureChoice = (verb: string, choice: FieldChoice) =>
    undo.capture(undoLabel(`${verb} choice`, choice.label), [
      { table: "FieldChoice", where: sql`Id = ${choice.id}` },
    ]);

  const listAll = Effect.fnUntraced(function* (projectId: string | null) {
    const scope = yield* decodeScope(projectId);
    const rows = yield* definitions.list();
    return listFields(rows, scope);
  }, sql.withTransaction);

  const listEffective = Effect.fnUntraced(function* (projectId: string) {
    const scope = yield* decodeId(projectId);
    const rows = yield* definitions.list();
    return effectiveFields(rows, scope);
  }, sql.withTransaction);

  const create = Effect.fnUntraced(function* (
    name: string,
    dataType: FieldDataType,
    projectId: string | null,
  ) {
    const scope = yield* decodeScope(projectId);
    if (scope !== null) {
      yield* projects.requireActive(scope);
    }
    const rows = yield* definitions.list();
    const now = yield* operationTime;
    const field = yield* checkRules(() => createField(newId(now), name, dataType, scope, rows));
    yield* captureField("Add", field);
    yield* definitions.insert(field);
    return field;
  }, undo.record);

  const editField = Effect.fnUntraced(function* (
    id: string,
    verb: string,
    change: (field: FieldDefinition, rows: readonly FieldDefinition[]) => FieldDefinition,
  ) {
    const key = yield* decodeId(id);
    const rows = yield* definitions.list();
    const field = yield* requireById(rows, key, "Field");
    const updated = yield* checkRules(() => change(field, rows));
    yield* captureField(verb, updated);
    yield* definitions.update(updated);
  }, undo.record);

  const changeType = Effect.fnUntraced(function* (id: string, dataType: FieldDataType) {
    const key = yield* decodeId(id);
    const rows = yield* definitions.list();
    const field = yield* requireById(rows, key, "Field");
    const used = yield* itemValues.hasValues(key);
    const updated = yield* checkRules(() => changeFieldType(field, dataType, used));
    yield* captureField("Change type of", updated);
    yield* definitions.update(updated);
  }, undo.record);

  const reorder = Effect.fnUntraced(function* (projectId: string | null, ids: readonly string[]) {
    const scope = yield* decodeScope(projectId);
    const order = yield* decodeIds(ids);
    const rows = yield* definitions.list();
    const ordered = yield* checkRules(() => reorderFields(rows, scope, order));
    yield* undo.capture("Reorder fields", [{ table: "FieldDefinition" }]);
    yield* Effect.forEach(ordered, definitions.update, { discard: true });
  }, undo.record);

  const addChoice = Effect.fnUntraced(function* (fieldId: string, label: string) {
    const key = yield* decodeId(fieldId);
    const fields = yield* definitions.list();
    const field = yield* requireById(fields, key, "Field");
    const rows = yield* choices.list(key);
    const now = yield* operationTime;
    const choice = yield* checkRules(() => createChoice(newId(now), field, label, rows));
    yield* captureChoice("Add", choice);
    yield* choices.insert(choice);
    return choice;
  }, undo.record);

  const editChoice = Effect.fnUntraced(function* (
    fieldId: string,
    choiceId: string,
    verb: string,
    change: (choice: FieldChoice, rows: readonly FieldChoice[]) => FieldChoice,
  ) {
    const key = yield* decodeId(choiceId);
    const rows = yield* choices.list(fieldId);
    const choice = yield* requireById(rows, key, "Choice");
    const updated = yield* checkRules(() => change(choice, rows));
    yield* captureChoice(verb, updated);
    yield* choices.update(updated);
  }, undo.record);

  const reorderFieldChoices = Effect.fnUntraced(function* (
    fieldId: string,
    ids: readonly string[],
  ) {
    const key = yield* decodeId(fieldId);
    const order = yield* decodeIds(ids);
    const rows = yield* choices.list(key);
    const ordered = yield* checkRules(() => reorderChoices(rows, key, order));
    yield* undo.capture("Reorder choices", [
      { table: "FieldChoice", where: sql`FieldDefinitionId = ${key}` },
    ]);
    yield* Effect.forEach(ordered, choices.update, { discard: true });
  }, undo.record);

  return {
    listAll,
    listEffective,
    create,
    rename: (id: string, name: string) =>
      editField(id, "Rename", (field, rows) => renameField(field, name, rows)),
    changeType,
    archive: (id: string) => editField(id, "Archive", archiveField),
    restore: (id: string) => editField(id, "Restore", restoreField),
    reorder,
    listChoices: (fieldId: string) => sql.withTransaction(choices.list(fieldId)),
    addChoice,
    renameChoice: (fieldId: string, choiceId: string, label: string) =>
      editChoice(fieldId, choiceId, "Rename", (choice, rows) => renameChoice(choice, label, rows)),
    archiveChoice: (fieldId: string, choiceId: string) =>
      editChoice(fieldId, choiceId, "Archive", archiveChoice),
    restoreChoice: (fieldId: string, choiceId: string) =>
      editChoice(fieldId, choiceId, "Restore", restoreChoice),
    reorderChoices: reorderFieldChoices,
  };
});

/**
 * Transactional management and lookup of global and project custom fields and their choices.
 * Each change records one undo step with its legacy label.
 */
export class FieldService extends Context.Service<FieldService>()(
  "@task-tracker/server/FieldService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
