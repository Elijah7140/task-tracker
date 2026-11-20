import type {
  TicketCommentProjection,
  TicketListEntryProjection,
  TicketSnapshot,
} from "@task-tracker/contracts";
import type { TicketComment, TicketDetail, TicketListEntry } from "@task-tracker/core";

/** A comment with its UTC timestamp as an ISO string. */
export function projectTicketComment(comment: TicketComment): typeof TicketCommentProjection.Type {
  return { ...comment, createdAtUtc: comment.createdAtUtc.toString() };
}

/** A ticket's fixed fields and comment log, newest first (§7.19). */
export function projectTicket({
  detail,
  comments,
}: {
  readonly detail: TicketDetail;
  readonly comments: readonly TicketComment[];
}): typeof TicketSnapshot.Type {
  const { itemId, ...fields } = detail;
  return { itemId, detail: fields, comments: comments.map(projectTicketComment) };
}

/** A ticket list entry as the renderer sees it. */
export function projectTicketListEntry(
  entry: TicketListEntry,
): typeof TicketListEntryProjection.Type {
  return entry;
}
