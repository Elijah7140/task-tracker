/** A problem found in query text, with where it is (§7.7). */
export interface QueryParseError {
  /** Zero-based UTF-16 index of the first character of the offending token. */
  readonly position: number;
  /** Number of UTF-16 code units in the offending token. */
  readonly length: number;
  /** What is wrong, in words a user can act on. */
  readonly message: string;
}

/** Describes `error`, quoting the offending token from `queryText` and its one-based character. */
export function describeQueryParseError(error: QueryParseError, queryText: string): string {
  const start = Math.min(error.position, queryText.length);
  const length = Math.min(error.length, queryText.length - start);
  const token = queryText.slice(start, start + length);
  return `${error.message} (at "${token}", character ${error.position + 1})`;
}
