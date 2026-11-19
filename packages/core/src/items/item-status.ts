import * as CompletionService from "../completion/completion-service.js";
import type { CompletionResult } from "../completion/completion-result.js";
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

/** Validate a new selection and route completion changes through the normal tree rules. */
export function planStatusChange(
  tree: ItemTree,
  itemId: string,
  statusId: string | null,
  statuses: readonly StatusLevel[],
  autoComplete: boolean,
  now: Temporal.Instant,
  approval?: readonly string[],
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
  return done
    ? CompletionService.complete(tree, itemId, autoComplete, now, approval)
    : CompletionService.reopen(tree, itemId, autoComplete, now);
}
