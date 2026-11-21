import type { Urgency } from "../urgency/displayed-urgency.js";

const urgencyRank: Record<Urgency, number> = {
  Overdue: 0,
  Imminent: 1,
  Approaching: 2,
  None: 3,
};

/** What decides an in-progress item's place on the tray card (§7.18). */
export interface InProgressSortKey {
  readonly urgency: Urgency;
  /** The priority level's position in its list; lower is more important. Null without one. */
  readonly priorityRank: number | null;
  readonly deadline: Temporal.Instant | null;
  readonly title: string;
}

/** Sorts present numbers ascending and puts missing ones last. */
function compareMissingLast(left: number | null, right: number | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  return right === null ? -1 : left - right;
}

function compareDeadlines(left: Temporal.Instant | null, right: Temporal.Instant | null): number {
  return compareMissingLast(
    left === null ? null : Number(left.epochMilliseconds),
    right === null ? null : Number(right.epochMilliseconds),
  );
}

/**
 * Orders the tray card's in-progress items (§7.18): most urgent first, then by
 * priority rank, then by earliest deadline, then by title with `compareTitles`.
 * Items without a priority or deadline come after those with one.
 */
export function compareInProgress(
  left: InProgressSortKey,
  right: InProgressSortKey,
  compareTitles: (left: string, right: string) => number,
): number {
  return (
    urgencyRank[left.urgency] - urgencyRank[right.urgency] ||
    compareMissingLast(left.priorityRank, right.priorityRank) ||
    compareDeadlines(left.deadline, right.deadline) ||
    compareTitles(left.title, right.title)
  );
}
