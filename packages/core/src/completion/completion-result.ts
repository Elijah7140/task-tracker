/** A timestamp change for one item. A null timestamp reopens the item. */
export interface CompletionChange {
  readonly itemId: string;
  readonly completedAtUtc: Temporal.Instant | null;
}

/** Completion changes the application can persist together. */
export interface AppliedCompletion {
  readonly kind: "applied";
  readonly changes: readonly CompletionChange[];
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
