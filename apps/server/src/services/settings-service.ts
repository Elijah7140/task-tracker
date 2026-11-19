import {
  describeReconciliation,
  needsReconciliationConfirmation,
  SettingsCatalogue,
  SettingsResolver,
  validateThresholds,
  type DurationTicks,
  type ReconciliationApproval,
  type SettingDefinition,
} from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { projectRepository } from "../db/repositories/project-repository.js";
import type { UndoSource } from "../db/undo/undo-rows.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { checkRules } from "./check-rules.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { operationTime } from "./operation-time.js";
import { projectCompletionOperations } from "./project-completion-reconciler.js";
import { UndoService } from "./undo-service.js";

const { autoCompleteParents, urgencyYellowThreshold, urgencyRedThreshold, workspaceCardColumns } =
  SettingsCatalogue;
const noOverrides: ReadonlyMap<string, string> = new Map();

function applyOverrides(
  current: ReadonlyMap<string, string>,
  updates: ReadonlyMap<string, string | null>,
) {
  const proposed = new Map(current);
  for (const [key, value] of updates) {
    if (value === null) {
      proposed.delete(key);
    } else {
      proposed.set(key, value);
    }
  }
  return proposed;
}

function formatNullableOverride<T>(definition: SettingDefinition<T>, value: T | null) {
  return value === null ? null : definition.formatOverride(value);
}

/** Reads the current effective global value, treating malformed text as unknown. */
function storedGlobal<T>(current: ReadonlyMap<string, string>, definition: SettingDefinition<T>) {
  const stored = current.get(definition.key);
  if (stored === undefined) {
    return definition.defaultValue;
  }
  try {
    return definition.parse(stored);
  } catch {
    return undefined;
  }
}

/**
 * Proposes a bulk-saved global value only when it changes the effective value, so saving
 * untouched defaults writes nothing and leaves undo history intact.
 */
function proposeGlobal<T>(
  proposed: Map<string, string>,
  current: ReadonlyMap<string, string>,
  definition: SettingDefinition<T>,
  value: T,
) {
  if (storedGlobal(current, definition) !== value) {
    proposed.set(definition.key, definition.format(value));
  }
}

const globalSettingsLabel = "Edit global settings";
const projectSettingsLabel = "Edit project settings";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = projectRepository(sql);
  const settings = settingsRepository(sql);
  const reconciliation = projectCompletionOperations(sql);
  const undo = yield* UndoService;

  /** Captures the settings rows and the items of every project the change reconciles. */
  const captureSettings = (
    label: string,
    settingsSource: UndoSource,
    enabledProjects: readonly string[],
  ) =>
    undo.capture(
      label,
      enabledProjects.length === 0
        ? [settingsSource]
        : [settingsSource, { table: "TodoItem", where: sql.in("ProjectId", enabledProjects) }],
      { autoCompletionEnabledProjects: enabledProjects },
    );

  const getGlobal = Effect.fnUntraced(function* <T>(definition: SettingDefinition<T>) {
    const global = yield* settings.global();
    return yield* checkRules(
      () => SettingsResolver.resolveValue(definition, global, noOverrides).value,
    );
  }, sql.withTransaction);

  const getGlobalSettings = Effect.fnUntraced(function* () {
    const global = yield* settings.global();
    return yield* checkRules(() => SettingsResolver.resolve(global, noOverrides));
  }, sql.withTransaction);

  const getEffective = Effect.fnUntraced(function* (projectId: string) {
    const project = yield* projects.requireActive(projectId);
    return yield* readEffectiveSettings(settings, project.id);
  }, sql.withTransaction);

  const planReconciliation = Effect.fnUntraced(function* (projectIds: readonly string[]) {
    const now = yield* operationTime;
    const changes = yield* Effect.forEach(projectIds, (projectId) =>
      reconciliation
        .plan(projectId, now)
        .pipe(Effect.map((changes) => changes.map((change) => ({ ...change, projectId, now })))),
    );
    return changes.flat();
  });

  const planGlobal = Effect.fnUntraced(function* (
    current: ReadonlyMap<string, string>,
    proposed: ReadonlyMap<string, string>,
  ) {
    yield* checkRules(() => validateThresholds(SettingsResolver.resolve(proposed, noOverrides)));
    // Include deleted projects so restoring them cannot introduce invalid thresholds.
    const rows = yield* projects.listAll(undefined);
    const enabled: string[] = [];
    for (const project of rows) {
      const overrides = yield* settings.project(project.id);
      const turnsOn = yield* checkRules(() => {
        const next = SettingsResolver.resolve(proposed, overrides);
        validateThresholds(next, project.name);
        const previous = SettingsResolver.resolveValue(autoCompleteParents, current, overrides);
        return !previous.value && next.autoCompleteParents.value;
      });
      if (turnsOn && project.deletedAtUtc === null) {
        enabled.push(project.id);
      }
    }
    return { enabled, changes: yield* planReconciliation(enabled) };
  });

  const planProject = Effect.fnUntraced(function* (
    projectId: string,
    global: ReadonlyMap<string, string>,
    current: ReadonlyMap<string, string>,
    proposed: ReadonlyMap<string, string>,
  ) {
    const turnsOn = yield* checkRules(() => {
      const next = SettingsResolver.resolve(global, proposed);
      validateThresholds(next);
      const previous = SettingsResolver.resolveValue(autoCompleteParents, global, current);
      return !previous.value && next.autoCompleteParents.value;
    });
    const enabled = turnsOn ? [projectId] : [];
    return { enabled, changes: yield* planReconciliation(enabled) };
  });

  const previewAutoComplete = Effect.fnUntraced(function* (projectId: string | undefined) {
    const global = yield* settings.global();
    const rows =
      projectId === undefined
        ? yield* projects.listActive()
        : [yield* projects.requireActive(projectId)];
    const enabled: string[] = [];
    for (const project of rows) {
      const overrides = yield* settings.project(project.id);
      const current = yield* checkRules(() =>
        SettingsResolver.resolveValue(autoCompleteParents, global, overrides),
      );
      if (!current.value && (projectId !== undefined || current.source === "Global")) {
        enabled.push(project.id);
      }
    }
    const changes = yield* planReconciliation(enabled);
    return describeReconciliation(changes);
  }, sql.withTransaction);

  const updateGlobal = Effect.fnUntraced(function* (
    encode: (current: ReadonlyMap<string, string>) => ReadonlyMap<string, string>,
    approval: ReconciliationApproval | undefined,
  ) {
    const current = yield* settings.global();
    const updates = yield* checkRules(() => encode(current));
    const proposed = new Map([...current, ...updates]);
    const { enabled, changes } = yield* planGlobal(current, proposed);
    const preview = describeReconciliation(changes);
    if (needsReconciliationConfirmation(preview, approval)) {
      return { kind: "needs-confirmation" as const, preview };
    }

    yield* captureSettings(globalSettingsLabel, { table: "GlobalSetting" }, enabled);
    for (const [Key, Value] of updates) {
      yield* settings.setGlobal({ Key, Value });
    }
    yield* Effect.forEach(changes, reconciliation.apply, { discard: true });
    return { kind: "applied" as const };
  }, undo.record);

  const updateProject = Effect.fnUntraced(function* (
    projectId: string,
    encode: () => ReadonlyMap<string, string | null>,
    approval: ReconciliationApproval | undefined,
  ) {
    const project = yield* projects.requireActive(projectId);
    const updates = yield* checkRules(encode);
    const global = yield* settings.global();
    const current = yield* settings.project(project.id);
    const { enabled, changes } = yield* planProject(
      project.id,
      global,
      current,
      applyOverrides(current, updates),
    );
    const preview = describeReconciliation(changes);
    if (needsReconciliationConfirmation(preview, approval)) {
      return { kind: "needs-confirmation" as const, preview };
    }

    yield* captureSettings(
      projectSettingsLabel,
      { table: "ProjectSetting", where: sql`ProjectId = ${project.id}` },
      enabled,
    );
    for (const [Key, Value] of updates) {
      yield* settings.setProject({ ProjectId: project.id, Key, Value });
    }
    yield* Effect.forEach(changes, reconciliation.apply, { discard: true });
    return { kind: "applied" as const };
  }, undo.record);

  return {
    /** Read a global value, falling back to its built-in default. */
    getGlobal,
    /** Read all global values from one snapshot, falling back to built-in defaults. */
    getGlobalSettings,
    /** Read an active project's effective settings and their sources from one snapshot. */
    getEffective,
    /** Preview enabling automatic completion for active projects that inherit the global value. */
    previewGlobalAutoComplete: () => previewAutoComplete(undefined),
    /** Preview enabling automatic completion for one active project. */
    previewProjectAutoComplete: (projectId: string) => previewAutoComplete(projectId),
    /** Set a single global value, subject to project constraints and reconciliation. */
    setGlobal: <T>(definition: SettingDefinition<T>, value: T, approval?: ReconciliationApproval) =>
      updateGlobal(() => new Map([[definition.key, definition.format(value)]]), approval),
    /** Save the global defaults together, writing only values that change. */
    saveGlobal: (
      autoComplete: boolean,
      yellow: DurationTicks,
      red: DurationTicks,
      approval?: ReconciliationApproval,
      cardColumns?: number,
    ) =>
      updateGlobal((current) => {
        const proposed = new Map<string, string>();
        proposeGlobal(proposed, current, autoCompleteParents, autoComplete);
        proposeGlobal(proposed, current, urgencyYellowThreshold, yellow);
        proposeGlobal(proposed, current, urgencyRedThreshold, red);
        if (cardColumns !== undefined) {
          proposeGlobal(proposed, current, workspaceCardColumns, cardColumns);
        }
        return proposed;
      }, approval),
    /** Override one setting on an active project. */
    setProjectOverride: <T>(
      projectId: string,
      definition: SettingDefinition<T>,
      value: T,
      approval?: ReconciliationApproval,
    ) =>
      updateProject(
        projectId,
        () => new Map([[definition.key, definition.formatOverride(value)]]),
        approval,
      ),
    /** Remove an override and validate the newly inherited value. */
    clearProjectOverride: <T>(
      projectId: string,
      definition: SettingDefinition<T>,
      approval?: ReconciliationApproval,
    ) => updateProject(projectId, () => new Map([[definition.key, null]]), approval),
    /** Save overrides together, clearing any whose supplied value is null. */
    saveProject: (
      projectId: string,
      autoComplete: boolean | null,
      yellow: DurationTicks | null,
      red: DurationTicks | null,
      approval?: ReconciliationApproval,
    ) =>
      updateProject(
        projectId,
        () =>
          new Map([
            [autoCompleteParents.key, formatNullableOverride(autoCompleteParents, autoComplete)],
            [urgencyYellowThreshold.key, formatNullableOverride(urgencyYellowThreshold, yellow)],
            [urgencyRedThreshold.key, formatNullableOverride(urgencyRedThreshold, red)],
          ]),
        approval,
      ),
  };
});

/** Transactional global defaults, project overrides and completion reconciliation. */
export class SettingsService extends Context.Service<SettingsService>()(
  "@task-tracker/server/SettingsService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
