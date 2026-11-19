import {
  MetadataRuleError,
  SettingsResolver,
  type EffectiveSettings,
  type UndoDirection,
} from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import type { ReplayRow } from "./replay-rows.js";

type Settings = ReadonlyMap<string, string>;

interface ProjectRow {
  readonly Id: string;
  readonly Name: string;
  readonly DeletedAtUtc: string | null;
}

const refuse = (message: string) => Effect.fail(new MetadataRuleError(message));

const readSettings = (rows: readonly { Key: string; Value: string }[]): Settings =>
  new Map(rows.map(({ Key, Value }) => [Key, Value]));

/** Applies the replayed rows of one settings table to the current values. */
function proposeValues(current: Settings, rows: readonly ReplayRow[]): Settings {
  const proposed = new Map(current);
  for (const { source, target } of rows) {
    const key = String((target ?? source)!.Key);
    if (target === undefined) {
      proposed.delete(key);
    } else {
      proposed.set(key, String(target.Value));
    }
  }
  return proposed;
}

/** Malformed stored text cannot leave valid thresholds, so it refuses like a conflict. */
const resolveSettings = (global: Settings, overrides: Settings) =>
  Effect.try({
    try: () => SettingsResolver.resolve(global, overrides),
    catch: () => thresholdsRefusal,
  });

const thresholdsRefusal = new MetadataRuleError(
  "Settings changed since. Applying this step would leave invalid urgency thresholds.",
);

const requireValidThresholds = (settings: EffectiveSettings) =>
  SettingsResolver.hasValidThresholds(settings) ? Effect.void : Effect.fail(thresholdsRefusal);

interface SettingsChange {
  readonly global: Settings;
  readonly nextGlobal: Settings;
  readonly projectRows: Partial<Record<string, ReplayRow[]>>;
  readonly enabled: ReadonlySet<string>;
  readonly direction: UndoDirection;
}

/** Validates one project's transition and reports whether automatic completion turns on. */
const verifyProject = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  project: ProjectRow,
  change: SettingsChange,
) {
  const overrides = readSettings(
    yield* sql<{ Key: string; Value: string }>`
      SELECT Key, Value FROM ProjectSetting WHERE ProjectId = ${project.Id}`,
  );
  const nextOverrides = proposeValues(overrides, change.projectRows[project.Id] ?? []);
  const current = yield* resolveSettings(change.global, overrides);
  const next = yield* resolveSettings(change.nextGlobal, nextOverrides);
  yield* requireValidThresholds(next);
  const turningOn = change.direction === "redo";
  if (
    change.enabled.has(project.Id) &&
    (current.autoCompleteParents.value === turningOn ||
      next.autoCompleteParents.value !== turningOn)
  ) {
    return yield* refuse(
      `Automatic completion changed for project '${project.Name}' since this step.`,
    );
  }
  return (
    project.DeletedAtUtc === null &&
    next.autoCompleteParents.value &&
    !current.autoCompleteParents.value
  );
});

const verifyEnabledProjectsActive = (
  projects: readonly ProjectRow[],
  enabled: ReadonlySet<string>,
) => {
  const active = new Set(projects.filter((row) => row.DeletedAtUtc === null).map((row) => row.Id));
  return [...enabled].every((id) => active.has(id))
    ? Effect.void
    : refuse(
        "A project reconciled by this setting is missing or deleted. Restore the project first.",
      );
};

/**
 * Checks replayed settings against projects outside the step, before any write. Requires the
 * recorded automatic-completion transition for each reconciled project and returns the active
 * projects whose automatic completion the replay turns on.
 */
export const verifyReplaySettings = Effect.fnUntraced(function* (
  sql: SqlClient.SqlClient,
  rows: readonly ReplayRow[],
  enabledProjects: readonly string[],
  direction: UndoDirection,
) {
  const globalRows = rows.filter(({ table }) => table === "GlobalSetting");
  const projectRows = Object.groupBy(
    rows.filter(({ table }) => table === "ProjectSetting"),
    ({ source, target }) => String((target ?? source)!.ProjectId),
  );
  if (globalRows.length === 0 && Object.keys(projectRows).length === 0) {
    return new Set<string>();
  }
  const global = readSettings(
    yield* sql<{ Key: string; Value: string }>`
    SELECT Key, Value FROM GlobalSetting`,
  );
  const nextGlobal = proposeValues(global, globalRows);
  yield* requireValidThresholds(yield* resolveSettings(nextGlobal, new Map()));
  const projects = yield* sql<ProjectRow>`SELECT Id, Name, DeletedAtUtc FROM Project`;
  const enabled = new Set(enabledProjects);
  yield* verifyEnabledProjectsActive(projects, enabled);
  const change = { global, nextGlobal, projectRows, enabled, direction };
  const turnedOn = new Set<string>();
  for (const project of projects) {
    if (globalRows.length === 0 && projectRows[project.Id] === undefined) {
      continue;
    }
    if (yield* verifyProject(sql, project, change)) {
      turnedOn.add(project.Id);
    }
  }
  return turnedOn;
});
