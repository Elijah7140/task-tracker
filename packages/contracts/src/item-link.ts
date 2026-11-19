import { Schema } from "effect";
import { Guid } from "./guid.js";

/** A stored web or mail link of an item, in list order (§7.10). */
export const ItemLink = Schema.Struct({
  id: Guid,
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
  sortOrder: Schema.Int,
});

/** One entry of the editor's replacement link list. A null ID adds a new link. */
export const ItemLinkInput = Schema.Struct({
  id: Schema.NullOr(Guid),
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
});
