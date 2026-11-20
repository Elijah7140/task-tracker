import { trimText } from "../text/dotnet-white-space.js";

/**
 * Decides which addresses the app stores and opens (§7.10). Only http, https
 * and mailto links are accepted, so a file path or custom scheme can never be
 * saved or launched. Editor, services, import and the launcher share it.
 */

/** The longest address a link may have, once trimmed. */
export const URL_MAX_LENGTH = 2_000;

/** The longest title a link may have, once trimmed. */
export const TITLE_MAX_LENGTH = 300;

/** The most links one item may carry, so a draft or a file cannot grow without bound. */
export const MAX_LINKS_PER_ITEM = 100;

const whitespace = /\p{White_Space}/u;
const control = /\p{Cc}/u;
const webAddress = /^https?:\/\/[^/\\?#]+/i;

/** Trims an address; null becomes empty. */
export function normalizeUrl(url: string | null | undefined): string {
  return url == null ? "" : trimText(url);
}

/** Trims a title; blank becomes null. */
export function normalizeTitle(title: string | null | undefined): string | null {
  const trimmed = title == null ? "" : trimText(title);
  return trimmed.length === 0 ? null : trimmed;
}

function textProblem(address: string): string | null {
  if (address.length === 0) {
    return "Enter a link address.";
  }
  if (address.length > URL_MAX_LENGTH) {
    return `A link address must be ${URL_MAX_LENGTH} characters or fewer.`;
  }
  if (whitespace.test(address)) {
    return "A link address cannot contain spaces; write a space as %20.";
  }
  return control.test(address) ? "A link address cannot contain control characters." : null;
}

function isAbsoluteWebOrMail(address: string): boolean {
  const parsed = URL.parse(address);
  if (parsed?.protocol === "mailto:") {
    return true;
  }
  return webAddress.test(address) && !address.includes("\\") && Boolean(parsed?.hostname);
}

function addressProblem(url: string | null | undefined): string | null {
  const address = normalizeUrl(url);
  const problem = textProblem(address);
  if (problem !== null) {
    return problem;
  }
  return isAbsoluteWebOrMail(address)
    ? null
    : "A link must be a full http, https or mailto address.";
}

/** Returns the first problem with a link, or null when it may be stored. */
export function validate(
  url: string | null | undefined,
  title: string | null | undefined,
): string | null {
  const problem = addressProblem(url);
  if (problem !== null) {
    return problem;
  }
  const length = normalizeTitle(title)?.length ?? 0;
  return length > TITLE_MAX_LENGTH
    ? `A link title must be ${TITLE_MAX_LENGTH} characters or fewer.`
    : null;
}

/** True when the text is an absolute http, https or mailto address the app may launch. */
export function isOpenable(url: string | null | undefined): boolean {
  return addressProblem(url) === null;
}
