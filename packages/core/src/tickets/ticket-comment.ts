import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { trimText } from "../text/dotnet-white-space.js";

/** One entry in a ticket's comment log (§7.19). Comments are added, never edited. */
export interface TicketComment {
  readonly id: string;
  readonly itemId: string;
  readonly body: string;
  readonly createdAtUtc: Temporal.Instant;
}

/** The longest comment accepted, roughly ten pages of text. */
const maxCommentLength = 20_000;

/** Validates and trims a new comment. */
export function createTicketComment(
  id: string,
  itemId: string,
  body: string,
  now: Temporal.Instant,
): TicketComment {
  const trimmed = trimText(body);
  if (trimmed.length === 0) {
    throw new MetadataRuleError("A comment needs some text.");
  }
  if (trimmed.length > maxCommentLength) {
    throw new MetadataRuleError(`A comment must be at most ${maxCommentLength} characters.`);
  }
  return { id, itemId, body: trimmed, createdAtUtc: now };
}
