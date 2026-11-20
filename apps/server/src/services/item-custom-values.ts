import {
  MetadataRuleError,
  planFieldValueEdits,
  type FieldValueInput,
  type TodoItem,
} from "@task-tracker/core";
import { Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql";
import { fieldRepository } from "../db/repositories/field-repository.js";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { lookupRepository } from "../db/repositories/lookup-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));

const normalizeFieldIds = Effect.fnUntraced(function* (input: FieldValueInput) {
  const fieldDefinitionId = yield* decodeId(input.fieldDefinitionId);
  const choiceId = yield* decodeNullableId(input.choiceId ?? null);
  return { ...input, fieldDefinitionId, choiceId };
});

/** Plans and writes an item's supplied custom values (§7.1), on the caller's transaction. */
export function itemCustomValues(sql: SqlClient.SqlClient) {
  const fields = fieldRepository(sql);
  const itemValues = itemFieldValueRepository(sql);

  const plan = Effect.fnUntraced(function* (
    item: TodoItem,
    customValues: readonly FieldValueInput[],
  ) {
    const inputs = yield* Effect.forEach(customValues, normalizeFieldIds);
    const definitions = yield* fields.definitions.list();
    const choiceIds = new Set(
      inputs.flatMap(({ choiceId }) => (choiceId === null ? [] : [choiceId])),
    );
    const choices = choiceIds.size === 0 ? [] : yield* fields.choices.findByIds([...choiceIds]);
    const existing = yield* itemValues.list(item.id);
    return yield* checkRules(() =>
      planFieldValueEdits(item.id, item.projectId, definitions, choices, existing, inputs),
    );
  });

  const write = Effect.fnUntraced(function* (
    itemId: string,
    custom: Effect.Success<ReturnType<typeof plan>>,
  ) {
    for (const fieldDefinitionId of custom.removals) {
      yield* itemValues.remove({ itemId, fieldDefinitionId });
    }
    yield* Effect.forEach(custom.upserts, itemValues.upsert, { discard: true });
  });

  return { plan, write };
}

/** Refuses a priority that is missing or archived. No priority is always allowed. */
export function activePriorityCheck(sql: SqlClient.SqlClient) {
  const lookups = lookupRepository(sql);
  return Effect.fnUntraced(function* (priorityLevelId: string | null) {
    if (priorityLevelId === null) {
      return;
    }
    const levels = yield* lookups.priorityLevels.list();
    if (!levels.some((level) => level.id === priorityLevelId && !level.isArchived)) {
      return yield* Effect.fail(new MetadataRuleError("Priority is missing or archived."));
    }
  });
}
