import {
  CompletionService,
  FloatingTime,
  type AppliedCompletion,
  type ItemTree,
  type OccurrenceContext,
  type OccurrenceCopy,
  type TodoItem,
} from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { itemFieldValueRepository } from "../db/repositories/item-field-value-repository.js";
import { itemLinkRepository } from "../db/repositories/item-link-repository.js";
import { itemRepository } from "../db/repositories/item-repository.js";
import { projectItemRepository } from "../db/repositories/project-item-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { checkRules } from "./check-rules.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { saveItemRows } from "./save-item-rows.js";
import { appendNewTickets } from "./ticket-ranks.js";

/**
 * Plan and apply completion changes within the caller's item transaction. Completing
 * a repeating item creates its next occurrence in the same transaction (§7.11).
 */
export function itemCompletionOperations(sql: SqlClient.SqlClient, timeZone: string) {
  const projectItems = projectItemRepository(sql);
  const settings = settingsRepository(sql);
  const items = itemRepository(sql);
  const values = itemFieldValueRepository(sql);
  const links = itemLinkRepository(sql);

  /** The local completion day in the server zone and an ID source for copies (§5.4). */
  const occurrenceContext = (now: Temporal.Instant): OccurrenceContext => ({
    completionDate: FloatingTime.toFloating(now, timeZone).toPlainDate(),
    newId: () => newId(now),
  });

  /** Copies custom values, links and the reminder choice from the final source row. */
  const copyDependents = Effect.fnUntraced(function* (
    { sourceId, itemId }: OccurrenceCopy,
    now: Temporal.Instant,
  ) {
    yield* values.copy({ sourceId, copyId: itemId });
    const sourceLinks = yield* links.list(sourceId);
    for (const link of sourceLinks) {
      yield* links.insert({ ...link, id: newId(now), itemId, createdAtUtc: now });
    }
    yield* items.copyReminder({ sourceId, copyId: itemId });
  });

  /**
   * Persists completion changes, successor markers and the dependent rows of
   * next occurrences, and ranks numbered occurrences as new tickets (§7.16).
   * The occurrence rows must already be inserted.
   */
  const apply = Effect.fnUntraced(function* (
    projectId: string,
    now: Temporal.Instant,
    applied: AppliedCompletion,
  ) {
    for (const change of applied.changes) {
      yield* projectItems.setCompletion({ ...change, projectId, now });
    }
    for (const id of applied.successorSourceIds ?? []) {
      yield* items.markSuccessorCreated({ id, now });
    }
    const occurrences = applied.occurrences ?? [];
    for (const copy of occurrences) {
      yield* copyDependents(copy, now);
    }
    yield* appendNewTickets(
      sql,
      occurrences.map(({ itemId }) => itemId),
    );
  });

  /**
   * Plans parent reconciliation after a structural change. With `occurrences`, a
   * repeating parent that completes adds its next occurrence to the tree.
   */
  const planReconciliation = Effect.fnUntraced(function* (
    tree: ItemTree,
    affectedParents: readonly (string | null)[],
    now: Temporal.Instant,
    occurrences = true,
  ) {
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const context = occurrences ? occurrenceContext(now) : undefined;
    return yield* checkRules(() =>
      CompletionService.afterStructureChanged(
        tree,
        affectedParents,
        effective.autoCompleteParents.value,
        now,
        context,
      ),
    );
  });

  /**
   * Plans completing or reopening one item with its cascade. Only the loaded
   * tree changes, so the caller can capture undo rows before saving the plan.
   */
  const planCompleted = Effect.fnUntraced(function* (
    tree: ItemTree,
    itemId: string,
    completed: boolean,
    approval?: readonly string[],
  ) {
    const effective = yield* readEffectiveSettings(settings, tree.projectId);
    const now = yield* operationTime;
    const autoComplete = effective.autoCompleteParents.value;
    const original = new Map(tree.allRows.map((row) => [row.id, row]));
    const context = occurrenceContext(now);
    const result = yield* checkRules(() =>
      completed
        ? CompletionService.complete(tree, itemId, autoComplete, now, approval, context)
        : CompletionService.reopen(tree, itemId, autoComplete, now),
    );
    return { result, original, now };
  });

  /** Saves the rows an applied completion plan changed, then any next occurrences. */
  const saveCompleted = Effect.fnUntraced(function* (
    tree: ItemTree,
    original: ReadonlyMap<string, TodoItem>,
    now: Temporal.Instant,
    applied: AppliedCompletion,
  ) {
    yield* saveItemRows(items, tree, original);
    yield* apply(tree.projectId, now, applied);
  });

  return { apply, occurrenceContext, planReconciliation, planCompleted, saveCompleted };
}
