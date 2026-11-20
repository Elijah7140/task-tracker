import type { CompletionChange } from "./completion-result.js";

/** Counts of parent transitions needed to enable automatic completion. */
export interface ReconciliationPreview {
  readonly parentsToComplete: number;
  readonly parentsToReopen: number;
}

/** The parent transitions approved in a settings confirmation. */
export interface ReconciliationApproval {
  readonly parentIdsToComplete: readonly string[];
  readonly parentIdsToReopen: readonly string[];
}

/** Counts to display and exact parent transitions to submit on approval. */
export type SettingsReconciliationPreview = ReconciliationPreview & ReconciliationApproval;

/** Describe proposed changes in a stable order regardless of the order they were loaded. */
export function describeReconciliation(
  changes: readonly CompletionChange[],
): SettingsReconciliationPreview {
  const parentIdsToComplete: string[] = [];
  const parentIdsToReopen: string[] = [];
  for (const { itemId, completedAtUtc } of changes) {
    const ids = completedAtUtc === null ? parentIdsToReopen : parentIdsToComplete;
    ids.push(itemId);
  }
  return {
    parentsToComplete: parentIdsToComplete.length,
    parentsToReopen: parentIdsToReopen.length,
    parentIdsToComplete: parentIdsToComplete.sort(),
    parentIdsToReopen: parentIdsToReopen.sort(),
  };
}

function sameIds(expected: readonly string[], approved: readonly string[]): boolean {
  return (
    expected.length === approved.length &&
    approved.toSorted().every((id, index) => id === expected[index])
  );
}

/** Require approval of the current parent transitions whenever the affected work changes. */
export function needsReconciliationConfirmation(
  preview: SettingsReconciliationPreview,
  approval: ReconciliationApproval | undefined,
): boolean {
  if (approval === undefined) {
    return preview.parentsToComplete > 0 || preview.parentsToReopen > 0;
  }
  return (
    !sameIds(preview.parentIdsToComplete, approval.parentIdsToComplete) ||
    !sameIds(preview.parentIdsToReopen, approval.parentIdsToReopen)
  );
}
