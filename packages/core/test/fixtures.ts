import type { Folder, TodoItem } from "../src/index.js";

export const now = Temporal.Instant.from("2026-11-13T12:00:00Z");
export const earlier = now.subtract({ hours: 24 });
export const projectId = "project";

export function item(id: string, overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    projectId,
    folderId: null,
    parentItemId: null,
    title: "Task",
    description: null,
    ticketNumber: null,
    priorityLevelId: null,
    itemTypeId: null,
    dueDate: null,
    dueTime: null,
    scheduledStart: null,
    scheduledEnd: null,
    completedAtUtc: null,
    sortOrder: 0,
    createdAtUtc: earlier,
    updatedAtUtc: earlier,
    deletedAtUtc: null,
    deletionBatchId: null,
    ...overrides,
  };
}

export function folder(id: string, overrides: Partial<Folder> = {}): Folder {
  return {
    id,
    projectId,
    parentFolderId: null,
    name: "Folder",
    sortOrder: 0,
    createdAtUtc: earlier,
    updatedAtUtc: earlier,
    deletedAtUtc: null,
    deletionBatchId: null,
    ...overrides,
  };
}
