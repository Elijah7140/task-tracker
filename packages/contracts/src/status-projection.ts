import { Schema } from "effect";
import { Guid } from "./guid.js";

/** The fixed completion semantics of a workflow status. */
export const StatusKind = Schema.Literals(["Open", "Done"]);

/** A workflow status, including archived entries still referenced by items. */
export const StatusProjection = Schema.Struct({
  id: Guid,
  name: Schema.String,
  kind: StatusKind,
  isArchived: Schema.Boolean,
  sortOrder: Schema.Int,
});
