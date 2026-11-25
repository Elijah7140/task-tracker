import type { StatusProjection } from "@task-tracker/contracts";

/**
 * A status's position in the Statuses list (App Settings), where a smaller rank sorts first.
 * No status, or one the list does not know, ranks after every listed status (§7.17).
 */
export type StatusRank = (statusId: string | null) => number;

/** Ranks statuses by their list order, including archived ones still on items. */
export function statusRankOf(statuses: ReadonlyArray<typeof StatusProjection.Type>): StatusRank {
  const ordered = statuses.toSorted((left, right) => left.sortOrder - right.sortOrder);
  const ranks = new Map(ordered.map((status, index) => [status.id, index]));
  const unlisted = ordered.length;
  return (statusId) => (statusId === null ? unlisted : (ranks.get(statusId) ?? unlisted));
}
