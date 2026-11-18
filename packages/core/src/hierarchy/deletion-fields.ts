/** A soft-delete timestamp and the batch that owns the deletion. */
export interface DeletionFields {
  readonly deletedAtUtc: Temporal.Instant | null;
  readonly deletionBatchId: string | null;
}
