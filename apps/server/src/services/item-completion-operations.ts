import { CompletionService, type AppliedCompletion, type ItemTree } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { checkRules } from "./check-rules.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { operationTime } from "./operation-time.js";

/** Plan and apply completion changes within the caller's item transaction. */
export function itemCompletionOperations(sql: SqlClient.SqlClient) {
  const projectItems = projectItemRepository(sql);
  const settings = settingsRepository(sql);

  const apply = (projectId: string, now: Temporal.Instant, applied: AppliedCompletion) =>
    Effect.forEach(
      applied.changes,
      (change) => projectItems.setCompletion({ ...change, projectId, now }),
      { discard: true },
    );

  const planReconciliation = Effect.fnUntraced(function* (
    tree: ItemTree,
    affectedParents: readonly (string | null)[],
    now: Temporal.Instant,
  ) {
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    return yield* checkRules(() =>
      CompletionService.afterStructureChanged(
        tree,
        affectedParents,
        effective.autoCompleteParents.value,
        now,
      ),
    );
  });

  const setCompleted = Effect.fnUntraced(function* (
    tree: ItemTree,
    itemId: string,
    completed: boolean,
    approval?: readonly string[],
  ) {
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const now = yield* operationTime;
    const autoComplete = effective.autoCompleteParents.value;
    const result = yield* checkRules(() =>
      completed
        ? CompletionService.complete(tree, itemId, autoComplete, now, approval)
        : CompletionService.reopen(tree, itemId, autoComplete, now),
    );
    if (result.kind === "applied") {
      yield* apply(tree.projectId, now, result);
    }
    return result;
  });

  return { apply, planReconciliation, setCompleted };
}
