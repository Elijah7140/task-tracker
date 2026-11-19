import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoUtcInstant } from "./iso-date-time.js";

/** An active folder with its parent ID and position among siblings. */
export const FolderProjection = Schema.Struct({
  id: Guid,
  projectId: Guid,
  parentFolderId: Schema.NullOr(Guid),
  name: Schema.String,
  sortOrder: Schema.Int,
  createdAtUtc: IsoUtcInstant,
  updatedAtUtc: IsoUtcInstant,
});
