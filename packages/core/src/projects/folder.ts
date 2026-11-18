import type { DeletionFields } from "../hierarchy/deletion-fields.js";

/** A named area in one project, optionally nested under another folder. */
export interface Folder extends DeletionFields {
  readonly id: string;
  readonly projectId: string;
  readonly parentFolderId: string | null;
  readonly name: string;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}
