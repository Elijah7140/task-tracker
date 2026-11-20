import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { fieldRepository } from "../../db/repositories/field-repository.js";
import { folderRepository } from "../../db/repositories/folder-repository.js";
import { itemFieldValueRepository } from "../../db/repositories/item-field-value-repository.js";
import { itemLinkRepository } from "../../db/repositories/item-link-repository.js";
import { itemRepository } from "../../db/repositories/item-repository.js";
import { lookupRepository } from "../../db/repositories/lookup-repository.js";
import { projectRepository } from "../../db/repositories/project-repository.js";
import { savedSearchRepository } from "../../db/repositories/saved-search-repository.js";
import { settingsRepository } from "../../db/repositories/settings-repository.js";
import { statusRepository } from "../../db/repositories/status-repository.js";
import { appendNewTickets } from "../ticket-ranks.js";
import type { ImportPlan } from "./import-plan.js";

const each = <A, E, R>(rows: readonly A[], write: (row: A) => Effect.Effect<void, E, R>) =>
  Effect.forEach(rows, write, { discard: true });

/**
 * Inserts a planned import on the caller's transaction, parents before children,
 * then ranks the new open tickets at the bottom of their sections (§7.16).
 */
export const writeImportPlan = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  plan: ImportPlan,
) {
  const lookups = lookupRepository(sql);
  const fields = fieldRepository(sql);
  yield* each(plan.itemTypes, lookups.itemTypes.insert);
  yield* each(plan.priorityLevels, lookups.priorityLevels.insert);
  yield* each(plan.statuses, statusRepository(sql).insert);
  yield* each(plan.projects, projectRepository(sql).insert);
  yield* each(plan.settings, ({ projectId, key, value }) =>
    settingsRepository(sql).setProject({ ProjectId: projectId, Key: key, Value: value }),
  );
  yield* each(plan.fields, fields.definitions.insert);
  yield* each(plan.choices, fields.choices.insert);
  yield* each(plan.folders, folderRepository(sql).insert);
  yield* each(plan.items, itemRepository(sql).insert);
  yield* each(plan.values, itemFieldValueRepository(sql).upsert);
  yield* each(plan.links, itemLinkRepository(sql).insert);
  yield* each(plan.savedSearches, savedSearchRepository(sql).insert);
  yield* appendNewTickets(
    sql,
    plan.items.map((item) => item.id),
  );
});
