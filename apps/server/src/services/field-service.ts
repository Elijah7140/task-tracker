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
    yield* definitions.insert(field);
    return field;
  }, sql.withTransaction);

  const editField = Effect.fnUntraced(function* (
    id: string,
    change: (field: FieldDefinition, rows: readonly FieldDefinition[]) => FieldDefinition,
  ) {
    const key = yield* decodeId(id);
    const rows = yield* definitions.list();
    const field = yield* requireById(rows, key, "Field");
    const updated = yield* checkRules(() => change(field, rows));
    yield* definitions.update(updated);
  }, sql.withTransaction);

  const changeType = Effect.fnUntraced(function* (id: string, dataType: FieldDataType) {
    const key = yield* decodeId(id);
    const rows = yield* definitions.list();
    const field = yield* requireById(rows, key, "Field");
    const used = yield* itemValues.hasValues(key);
    const updated = yield* checkRules(() => changeFieldType(field, dataType, used));
    yield* definitions.update(updated);
  }, sql.withTransaction);

  const reorder = Effect.fnUntraced(function* (projectId: string | null, ids: readonly string[]) {
    const scope = yield* decodeScope(projectId);
    const order = yield* decodeIds(ids);
    const rows = yield* definitions.list();
    const ordered = yield* checkRules(() => reorderFields(rows, scope, order));
    yield* Effect.forEach(ordered, definitions.update, { discard: true });
  }, sql.withTransaction);

  const addChoice = Effect.fnUntraced(function* (fieldId: string, label: string) {
    const key = yield* decodeId(fieldId);
    const fields = yield* definitions.list();
    const field = yield* requireById(fields, key, "Field");
    const rows = yield* choices.list(key);
    const now = yield* operationTime;
    const choice = yield* checkRules(() => createChoice(newId(now), field, label, rows));
    yield* choices.insert(choice);
    return choice;
  }, sql.withTransaction);

  const editChoice = Effect.fnUntraced(function* (
    fieldId: string,
    choiceId: string,
    change: (choice: FieldChoice, rows: readonly FieldChoice[]) => FieldChoice,
  ) {
    const key = yield* decodeId(choiceId);
    const rows = yield* choices.list(fieldId);
    const choice = yield* requireById(rows, key, "Choice");
    const updated = yield* checkRules(() => change(choice, rows));
    yield* choices.update(updated);
  }, sql.withTransaction);

  const reorderFieldChoices = Effect.fnUntraced(function* (
    fieldId: string,
    ids: readonly string[],
  ) {
    const key = yield* decodeId(fieldId);
    const order = yield* decodeIds(ids);
    const rows = yield* choices.list(key);
    const ordered = yield* checkRules(() => reorderChoices(rows, key, order));
    yield* Effect.forEach(ordered, choices.update, { discard: true });
  }, sql.withTransaction);

  return {
    listAll,
    listEffective,
    create,
    rename: (id: string, name: string) =>
      editField(id, (field, rows) => renameField(field, name, rows)),
    changeType,
    archive: (id: string) => editField(id, archiveField),
    restore: (id: string) => editField(id, restoreField),
    reorder,
    listChoices: (fieldId: string) => sql.withTransaction(choices.list(fieldId)),
    addChoice,
    renameChoice: (fieldId: string, choiceId: string, label: string) =>
      editChoice(fieldId, choiceId, (choice, rows) => renameChoice(choice, label, rows)),
    archiveChoice: (fieldId: string, choiceId: string) =>
      editChoice(fieldId, choiceId, archiveChoice),
    restoreChoice: (fieldId: string, choiceId: string) =>
      editChoice(fieldId, choiceId, restoreChoice),
    reorderChoices: reorderFieldChoices,
  };
});

/** Transactional management and lookup of global and project custom fields and their choices. */
export class FieldService extends Context.Service<FieldService>()(
  "@task-tracker/server/FieldService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
