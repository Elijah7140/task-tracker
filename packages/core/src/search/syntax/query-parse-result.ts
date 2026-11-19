import type { FieldFilter } from "../item-query.js";
import type { QueryParseError } from "./query-parse-error.js";

/** The outcome of parsing query text: the query parts, or the errors that stopped it (§7.7). */
export interface QueryParseResult {
  /** The free-text words joined by single spaces, or null when there are none. */
  readonly text: string | null;
  /** The field conditions in the order they were written. */
  readonly filters: ReadonlyArray<FieldFilter>;
  /**
   * The query rewritten so it survives renames: choices appear as `#id` and dates as
   * typed, so `today` stays relative. Saved searches store this text.
   */
  readonly stableText: string;
  /**
   * The query as the user reads it: choices by label and dates as typed. Parsing it
   * again gives the same filters.
   */
  readonly displayText: string;
  /** True when the query asks for completed items, such as `is:done`. */
  readonly impliesIncludeCompleted: boolean;
  /** Every problem found, ordered by position. Empty on success. */
  readonly errors: ReadonlyArray<QueryParseError>;
}
