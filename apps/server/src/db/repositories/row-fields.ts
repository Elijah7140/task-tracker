import { Schema } from "effect";
import { Guid, UtcTimestamp } from "../storage-codecs.js";

/** Fields common to the three soft-deletable entity row schemas. */
export const trackedFields = {
  id: Guid,
  sortOrder: Schema.Int,
  createdAtUtc: UtcTimestamp,
  updatedAtUtc: UtcTimestamp,
  deletedAtUtc: Schema.NullOr(UtcTimestamp),
  deletionBatchId: Schema.NullOr(Guid),
};

/** Encode tracked fields with their legacy column names. */
export const trackedColumns = {
  id: "Id",
  sortOrder: "SortOrder",
  createdAtUtc: "CreatedAtUtc",
  updatedAtUtc: "UpdatedAtUtc",
  deletedAtUtc: "DeletedAtUtc",
  deletionBatchId: "DeletionBatchId",
} as const;

/** A deletion batch scoped to a single project. */
export const projectBatch = Schema.Struct({ projectId: Guid, batchId: Guid, now: UtcTimestamp });
