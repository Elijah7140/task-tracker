import type { DeletionFields } from "../hierarchy/deletion-fields.js";

/** A top-level container for folders and tasks. */
export interface Project extends DeletionFields {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}
