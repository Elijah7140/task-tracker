const LETTER_OR_DIGIT = /\p{L}|\p{N}/u;

/**
 * Converts user text into safe quoted prefix phrases for SQLite FTS5.
 * Raw user text never reaches `MATCH`; punctuation-only terms are ignored.
 */
export function buildFtsTerms(text: string | null | undefined): string | null {
  if (text === null || text === undefined) {
    return null;
  }
  const terms = text
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0 && LETTER_OR_DIGIT.test(term));
  if (terms.length === 0) {
    return null;
  }
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(" AND ");
}
