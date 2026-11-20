import { Schema } from "effect";
import { FolderProjection } from "./folder-projection.js";
import { Guid } from "./guid.js";

/** A navigation snapshot with active folders carrying parent IDs and sibling positions. */
export const ProjectWorkspace = Schema.Struct({
  projectId: Guid,
  name: Schema.String,
  folders: Schema.Array(FolderProjection),
});
