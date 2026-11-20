import { orderRows } from "../metadata/order-rows.js";
import type { DeletionFields } from "../hierarchy/deletion-fields.js";
import { projectName } from "./project-name.js";

/** A top-level container for folders and tasks. */
export interface Project extends DeletionFields {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly createdAtUtc: Temporal.Instant;
  readonly updatedAtUtc: Temporal.Instant;
}

/** Create an active project with a validated name. */
export function createProject(id: string, name: string, now: Temporal.Instant): Project {
  return {
    id,
    name: projectName(name),
    description: null,
    sortOrder: 0,
    createdAtUtc: now,
    updatedAtUtc: now,
    deletedAtUtc: null,
    deletionBatchId: null,
  };
}

/** Rename a project and record when it changed. */
export function renameProject(project: Project, newName: string, now: Temporal.Instant): Project {
  return { ...project, name: projectName(newName), updatedAtUtc: now };
}

/** Assign contiguous positions to the complete set of active projects. */
export function reorderProjects(
  projects: readonly Project[],
  ids: readonly string[],
  now: Temporal.Instant,
): readonly Project[] {
  return orderRows(projects, ids, "Order must contain every active project exactly once.").map(
    (project) => ({ ...project, updatedAtUtc: now }),
  );
}
