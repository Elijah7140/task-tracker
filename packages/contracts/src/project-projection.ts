import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoUtcInstant } from "./iso-date-time.js";

/** An active project returned by home and project creation. */
export const ProjectProjection = Schema.Struct({
  id: Guid,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  sortOrder: Schema.Int,
  createdAtUtc: IsoUtcInstant,
  updatedAtUtc: IsoUtcInstant,
});
