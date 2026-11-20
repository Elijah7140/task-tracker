/** The urgency levels for an item deadline. */
export type Urgency = "None" | "Approaching" | "Imminent" | "Overdue";

/** Displayed urgency and the descendant responsible for it, if any. */
export interface DisplayedUrgency {
  readonly value: Urgency;
  readonly sourceDescendantId: string | null;
}
