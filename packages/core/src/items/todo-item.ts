import type { DeletionFields } from "../hierarchy/deletion-fields.js";

/** A task or sub-item in a single project area. */
export interface TodoItem extends DeletionFields {
  readonly id: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly parentItemId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly ticketNumber: string | null;
  readonly priorityLevelId: string | null;
  readonly itemTypeId: string | null;
  readonly dueDate: Temporal.PlainDate | null;
  readonly dueTime: Temporal.PlainTime | null;
  readonly scheduledStart: Temporal.PlainDateTime | null;
  readonly scheduledEnd: Temporal.PlainDateTime | null;
  readonly completedAtUtc: Temporal.Instant | null;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}
