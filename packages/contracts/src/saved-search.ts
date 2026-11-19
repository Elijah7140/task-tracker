import { Schema } from "effect";
import { Guid } from "./guid.js";
import { SearchScope } from "./search.js";

/** What a saved search remembers and runs again (§7.7). */
export const SavedSearchDefinition = Schema.Struct({
  /** Query text in stable form: choices as `#id` and dates as typed. */
  queryText: Schema.String,
  scope: SearchScope,
  includeCompleted: Schema.Boolean,
});

/** A saved search in display order. Its scope IDs may name a project or folder deleted since. */
export const SavedSearchProjection = Schema.Struct({
  id: Guid,
  name: Schema.String,
  queryText: Schema.String,
  scope: SearchScope,
  includeCompleted: Schema.Boolean,
});
