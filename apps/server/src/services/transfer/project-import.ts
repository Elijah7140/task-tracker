import {
  IMPORTED_PROJECT_SETTINGS,
  listOf,
  SettingsCatalogue,
  SettingsResolver,
  TakenNames,
  TRANSFER_NAME_MAX_LENGTH,
  type EffectiveSettings,
  type Project,
  type ProjectDocument,
} from "@task-tracker/core";
import {
  type ImportContext,
  type ImportExisting,
  importTimestamps,
  nextSortOrder,
  sortOrderPositions,
} from "./import-plan.js";

const INVALID_THRESHOLDS =
  "With this computer's global settings the red threshold must be nonnegative and no greater than yellow.";

/** A project the import creates, kept with its document until its contents are planned. */
export interface ImportedProject {
  readonly project: Project;
  readonly document: ProjectDocument;
  /** The settings that apply once imported; null when the overrides were refused. */
  readonly settings: EffectiveSettings | null;
}

function overridesOf(document: ProjectDocument): Map<string, string> {
  const entries = [...(document.settings ?? new Map<string, string | null>())];
  return new Map(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

/** Stores the known overrides; Reminders enabled is normalized like the legacy importer did. */
function planOverrides(
  context: ImportContext,
  projectId: string,
  overrides: ReadonlyMap<string, string>,
) {
  for (const definition of IMPORTED_PROJECT_SETTINGS) {
    const text = overrides.get(definition.key);
    if (text === undefined) {
      continue;
    }
    const enabled = SettingsCatalogue.remindersEnabled;
    const value = definition.key === enabled.key ? enabled.format(enabled.parse(text)) : text;
    context.plan.settings.push({ projectId, key: definition.key, value });
  }
}

function applySettings(
  context: ImportContext,
  project: Project,
  document: ProjectDocument,
  global: ReadonlyMap<string, string>,
  path: string,
): EffectiveSettings | null {
  const overrides = overridesOf(document);
  const effective = SettingsResolver.resolve(global, overrides);
  if (!SettingsResolver.hasValidThresholds(effective)) {
    context.issues.add(`${path}.settings`, INVALID_THRESHOLDS);
    return null;
  }
  planOverrides(context, project.id, overrides);
  return effective;
}

function createProject(
  context: ImportContext,
  document: ProjectDocument,
  name: string,
  sortOrder: number,
): Project {
  return {
    id: context.newId(),
    name,
    description: document.description,
    sortOrder,
    ...importTimestamps(document.createdAtUtc, document.updatedAtUtc, context.now),
    deletedAtUtc: null,
    deletionBatchId: null,
  };
}

/**
 * Plans a new project for every project in the file, renamed with " (imported)"
 * when the name is taken, ordered after the existing projects, with its setting
 * overrides. Overrides that make this database's thresholds invalid are refused.
 */
export function importProjects(
  context: ImportContext,
  existing: ImportExisting,
): ImportedProject[] {
  const live = existing.projects.filter((project) => project.deletedAtUtc === null);
  const names = new TakenNames(
    live.map((project) => project.name),
    TRANSFER_NAME_MAX_LENGTH,
  );
  let order = nextSortOrder(existing.projects);
  const documents = listOf(context.document.projects);
  return sortOrderPositions(documents, (project) => project.sortOrder).map((position) => {
    const document = documents[position]!;
    const project = createProject(context, document, names.reserve(document.name!), order++);
    context.plan.projects.push(project);
    context.map.projects.set(document.id!, project.id);
    const path = `$.projects[${position}]`;
    return {
      project,
      document,
      settings: applySettings(context, project, document, existing.globalSettings, path),
    };
  });
}
