import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoFloatingDateTime } from "./iso-date-time.js";

/** What the top node of a deletion batch is. */
export const TrashNodeKind = Schema.Literals(["project", "folder", "item"]);

/**
 * One Trash row: a deletion batch described by the node deleted directly (§7.6).
 * `path` names the project, folders and parent items down to the top node's
 * parent and is empty for a project. `deletedAt` is the deletion instant read
 * as wall-clock time in the server's zone, so the renderer formats it as a
 * floating value. `earlierBatchCount` counts the project's other batches that a
 * project purge also removes.
 */
export const TrashBatch = Schema.Struct({
  batchId: Guid,
  kind: TrashNodeKind,
  topNodeId: Guid,
  title: Schema.String,
  projectId: Guid,
  path: Schema.Array(Schema.String),
  deletedAt: IsoFloatingDateTime,
  folderCount: Schema.Int,
  itemCount: Schema.Int,
  earlierBatchCount: Schema.Int,
  restoreBlockedReason: Schema.NullOr(Schema.String),
});
