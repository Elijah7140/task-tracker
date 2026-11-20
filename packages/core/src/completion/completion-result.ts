/** A timestamp change for one item. A null timestamp reopens the item. */
export interface CompletionChange {
  readonly itemId: string;
  readonly completedAtUtc: Temporal.Instant | null;
}

/** A next occurrence row added to the tree, with the row it copies (§7.11). */
export interface OccurrenceCopy {
  readonly sourceId: string;
  readonly itemId: string;
}

/** Completion changes the application can persist together. */
export interface AppliedCompletion {
  readonly kind: "applied";
  readonly changes: readonly CompletionChange[];
  /**
   * Copies added to the tree for next occurrences, each parent before its
   * children. The application inserts them and copies their dependent rows.
   */
  readonly occurrences?: readonly OccurrenceCopy[];
  /** Occurrences that created their successor and must remember it. */
  readonly successorSourceIds?: readonly string[];
  /** True when a completed occurrence's rule had no next date. */
  readonly lastRepeat?: boolean;
  /** Why a requested Done status was not applied: a new sub-item occurrence keeps the item open. */
  readonly parentKeptOpenMessage?: string;
}

/** A proposed completion or a reason to leave persisted state as-is. */
export type CompletionResult =
  | AppliedCompletion
  | {
      readonly kind: "needs-confirmation";
      readonly openSubItemCount: number;
      readonly openSubItemIds: readonly string[];
    }
  | { readonly kind: "blocked"; readonly reason: string };
