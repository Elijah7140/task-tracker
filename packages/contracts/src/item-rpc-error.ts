import { Schema } from "effect";

/** A requested item, deletion batch or hierarchy operation is unavailable in its current scope. */
export class ItemHierarchyError extends Schema.TaggedError<ItemHierarchyError>()(
  "ItemHierarchyError",
  { message: Schema.String },
) {}

/** The proposed item fields violate a domain rule. */
export class ItemValidationError extends Schema.TaggedError<ItemValidationError>()(
  "ItemValidationError",
  { message: Schema.String },
) {}

/** An item operation failed in storage. */
export class ItemStorageError extends Schema.TaggedError<ItemStorageError>()("ItemStorageError", {
  message: Schema.String,
}) {}

/** Application failures shared by the item RPCs. */
export const ItemRpcError = Schema.Union([
  ItemHierarchyError,
  ItemValidationError,
  ItemStorageError,
]);
