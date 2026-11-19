import * as CompletionService from "../completion/completion-service.js";
import type { CompletionResult } from "../completion/completion-result.js";
import type { OccurrenceContext } from "../completion/recurring-completion.js";
import type { StatusLevel } from "../lookups/status-level.js";
import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import type { ItemTree } from "./item-tree.js";
import type { TodoItem } from "./todo-item.js";

type StatusReferences = Pick<TodoItem, "statusId" | "reopenStatusId">;

/** Preserve the current Open status when completing, and restore it when reopening. */
export function completionStatus(
  item: TodoItem,
  completedAtUtc: Temporal.Instant | null,
  doneStatusId: string | null,
): StatusReferences {
  const wasDone = item.completedAtUtc !== null;
  if (completedAtUtc === null) {
    return { statusId: wasDone ? item.reopenStatusId : item.statusId, reopenStatusId: null };
  }
  if (wasDone) {
    return { statusId: item.statusId, reopenStatusId: item.reopenStatusId };
  }
  return { statusId: doneStatusId, reopenStatusId: item.statusId };
}

/**
 * Validate a new selection and route completion changes through the normal tree rules.
 * When a Done selection leaves the item open because a new occurrence of a sub-item
 * keeps it open, the result explains that and the status must not be assigned (§7.15).
 */
export function planStatusChange(
  tree: ItemTree,
  itemId: string,
  statusId: string | null,
  statuses: readonly StatusLevel[],
  autoComplete: boolean,
  now: Temporal.Instant,
  approval?: readonly string[],
  recurrence?: OccurrenceContext,
): CompletionResult {
  const item = tree.get(itemId);
  if (item.statusId === statusId) {
    return { kind: "applied", changes: [] };
  }
  const status = statuses.find((row) => row.id === statusId && !row.isArchived);
  if (statusId !== null && status === undefined) {
    throw new MetadataRuleError("Status is missing or archived.");
  }
  const done = status?.kind === "Done";
  if (done === (item.completedAtUtc !== null)) {
    return { kind: "applied", changes: [] };
  }
  if (!done) {
    return CompletionService.reopen(tree, itemId, autoComplete, now);
  }
  const result = CompletionService.complete(tree, itemId, autoComplete, now, approval, recurrence);
  const completed =
    result.kind === "applied" &&
    result.changes.some((change) => change.itemId === itemId && change.completedAtUtc !== null);
  if (result.kind !== "applied" || completed) {
    return result;
  }
  return {
    ...result,
    parentKeptOpenMessage: `A new occurrence of a sub-item keeps '${item.title}' open.`,
  };
}
