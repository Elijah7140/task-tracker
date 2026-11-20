import { MetadataRuleError } from "../metadata/metadata-rule-error.js";
import { orderRows } from "../metadata/order-rows.js";
import type { DeletionFields } from "../hierarchy/deletion-fields.js";
import { projectName } from "./project-name.js";

/** A top-level container for folders and tasks. */
export interface Project extends DeletionFields {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** The icon shown on the Home card and in the sidebar, or null for the initial (§7.19). */
  readonly iconKey: string | null;
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
    iconKey: null,
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

/** Icon keys are short lowercase slugs that the renderer maps to its icon set. */
const iconKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Set or clear a project's icon. */
export function setProjectIcon(
  project: Project,
  iconKey: string | null,
  now: Temporal.Instant,
): Project {
  if (iconKey !== null && (iconKey.length > 40 || !iconKeyPattern.test(iconKey))) {
    throw new MetadataRuleError("Icon must be a short lowercase name such as 'database'.");
  }
  return { ...project, iconKey, updatedAtUtc: now };
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
