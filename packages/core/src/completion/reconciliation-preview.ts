/** Counts of parent transitions needed to enable automatic completion. */
export interface ReconciliationPreview {
  readonly parentsToComplete: number;
  readonly parentsToReopen: number;
}
