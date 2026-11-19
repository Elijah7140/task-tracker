import { Schema } from "effect";
import { FieldFilter, SearchChoice } from "./search.js";

/** A problem found in search query text, with where it is (§7.7). */
export const QueryParseError = Schema.Struct({
  /** Zero-based UTF-16 index of the offending token. */
  position: Schema.Int,
  /** Number of UTF-16 code units in the offending token. */
  length: Schema.Int,
  message: Schema.String,
  /** The message with the offending token and its one-based character, as users read it. */
  description: Schema.String,
});

/** The active choices of one choice field a parsed query names. */
export const SearchQueryChoices = Schema.Struct({
  fieldKey: Schema.String,
  choices: Schema.Array(SearchChoice),
});

/**
 * Query text bound to the typed search model in its scope (§7.7). A parsed query
 * carries its filters for the filter builder and the choices they name; an invalid
 * one carries every error, ordered by position, and nothing runs.
 */
export const ParsedSearchQuery = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("parsed"),
    text: Schema.NullOr(Schema.String),
    filters: Schema.Array(FieldFilter),
    /** Free text and clauses with choices as `#id` and dates as typed, for saving. */
    stableText: Schema.String,
    /** The same query with choice labels, as users read it. */
    displayText: Schema.String,
    /** True when the query asks for completed items, such as `is:done`. */
    impliesIncludeCompleted: Schema.Boolean,
    choices: Schema.Array(SearchQueryChoices),
  }),
  Schema.Struct({
    kind: Schema.Literal("invalid"),
    errors: Schema.Array(QueryParseError),
  }),
]);
