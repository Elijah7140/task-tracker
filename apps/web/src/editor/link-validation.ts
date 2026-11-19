import { externalLinkAddress } from "@task-tracker/contracts";

/** The longest link address the server accepts, after trimming. The server still enforces it. */
export const LINK_URL_MAX_LENGTH = 2_000;

/** The longest link title the server accepts, after trimming. */
export const LINK_TITLE_MAX_LENGTH = 300;

/** The most links one item may carry (§7.10). */
export const MAX_LINKS_PER_ITEM = 100;

const whitespace = /\p{White_Space}/u;
const control = /\p{Cc}/u;

function addressTextProblem(address: string): string | null {
  if (address.length === 0) {
    return "Enter a link address.";
  }
  if (address.length > LINK_URL_MAX_LENGTH) {
    return `A link address must be ${LINK_URL_MAX_LENGTH} characters or fewer.`;
  }
  if (whitespace.test(address)) {
    return "A link address cannot contain spaces; write a space as %20.";
  }
  return control.test(address) ? "A link address cannot contain control characters." : null;
}

/** Trims a typed title; a blank one means no title. */
export function normalizeLinkTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * The server's `LinkPolicy` message for a typed link, or null when it is
 * acceptable, so the Links section can explain a rejection before saving.
 * Accepted addresses are exactly those the system link launcher opens.
 */
export function linkProblem(url: string, title: string): string | null {
  const address = url.trim();
  const problem = addressTextProblem(address);
  if (problem !== null) {
    return problem;
  }
  if (externalLinkAddress(address) === undefined) {
    return "A link must be a full http, https or mailto address.";
  }
  const titleLength = normalizeLinkTitle(title)?.length ?? 0;
  return titleLength > LINK_TITLE_MAX_LENGTH
    ? `A link title must be ${LINK_TITLE_MAX_LENGTH} characters or fewer.`
    : null;
}
