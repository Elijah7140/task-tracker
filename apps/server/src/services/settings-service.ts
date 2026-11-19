import {
  describeReconciliation,
  MetadataRuleError,
  needsReconciliationConfirmation,
  SettingsCatalogue,
  SettingsResolver,
  validateThresholds,
  type DurationTicks,
  type ReconciliationApproval,
  type SettingDefinition,
} from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { projectRepository } from "../db/repositories/project-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { readEffectiveSettings } from "./effective-settings-service.js";
import { operationTime } from "./operation-time.js";
import { projectCompletionOperations } from "./project-completion-reconciler.js";

const { autoCompleteParents, urgencyYellowThreshold, urgencyRedThreshold } = SettingsCatalogue;
const noOverrides: ReadonlyMap<string, string> = new Map();

function checkSettings<A>(run: () => A) {
  return Effect.try({
    try: run,
    catch: (error) => {
      if (
        error instanceof SyntaxError ||
        error instanceof RangeError ||
        error instanceof MetadataRuleError
      ) {
        return error;
      }
      throw error;
    },
  });
}

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

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = projectRepository(sql);
  const settings = settingsRepository(sql);
  const reconciliation = projectCompletionOperations(sql);

  const getGlobal = Effect.fnUntraced(function* <T>(definition: SettingDefinition<T>) {
    const global = yield* settings.global();
    return yield* checkSettings(
      () => SettingsResolver.resolveValue(definition, global, noOverrides).value,
    );
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
    yield* checkSettings(() => validateThresholds(SettingsResolver.resolve(proposed, noOverrides)));
    // Include deleted projects so restoring them cannot introduce invalid thresholds.
    const rows = yield* projects.listAll(undefined);
    const enabled: string[] = [];
    for (const project of rows) {
      const overrides = yield* settings.project(project.id);
      const turnsOn = yield* checkSettings(() => {
        const next = SettingsResolver.resolve(proposed, overrides);
        validateThresholds(next, project.name);
        const previous = SettingsResolver.resolveValue(autoCompleteParents, current, overrides);
        return !previous.value && next.autoCompleteParents.value;
      });
      if (turnsOn && project.deletedAtUtc === null) {
        enabled.push(project.id);
      }
    }
    return yield* planReconciliation(enabled);
  });

  const planProject = Effect.fnUntraced(function* (
    projectId: string,
    global: ReadonlyMap<string, string>,
    current: ReadonlyMap<string, string>,
    proposed: ReadonlyMap<string, string>,
  ) {
    const turnsOn = yield* checkSettings(() => {
      const next = SettingsResolver.resolve(global, proposed);
      validateThresholds(next);
      const previous = SettingsResolver.resolveValue(autoCompleteParents, global, current);
      return !previous.value && next.autoCompleteParents.value;
    });
    return yield* planReconciliation(turnsOn ? [projectId] : []);
  });

  const previewAutoComplete = Effect.fnUntraced(function* (projectId: string | undefined) {
    const global = yield* settings.global();
    const rows =
      projectId === undefined
        ? yield* projects.listActive()
        : Option.toArray(yield* projects.findActive(projectId));
    const enabled: string[] = [];
    for (const project of rows) {
      const overrides = yield* settings.project(project.id);
      const current = yield* checkSettings(() =>
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
    encode: () => ReadonlyMap<string, string>,
    approval: ReconciliationApproval | undefined,
  ) {
    const updates = yield* checkSettings(encode);
    const current = yield* settings.global();
    const proposed = new Map([...current, ...updates]);
    const changes = yield* planGlobal(current, proposed);
    const preview = describeReconciliation(changes);
    if (needsReconciliationConfirmation(preview, approval)) {
      return { kind: "needs-confirmation" as const, preview };
    }

    for (const [Key, Value] of updates) {
      yield* settings.setGlobal({ Key, Value });
    }
    yield* Effect.forEach(changes, reconciliation.apply, { discard: true });
    return { kind: "applied" as const };
  }, sql.withTransaction);

  const updateProject = Effect.fnUntraced(function* (
    projectId: string,
    encode: () => ReadonlyMap<string, string | null>,
    approval: ReconciliationApproval | undefined,
  ) {
    const project = yield* projects.requireActive(projectId);
    const updates = yield* checkSettings(encode);
    const global = yield* settings.global();
    const current = yield* settings.project(project.id);
    const changes = yield* planProject(
      project.id,
      global,
      current,
      applyOverrides(current, updates),
    );
    const preview = describeReconciliation(changes);
    if (needsReconciliationConfirmation(preview, approval)) {
      return { kind: "needs-confirmation" as const, preview };
    }

    for (const [Key, Value] of updates) {
      yield* settings.setProject({ ProjectId: project.id, Key, Value });
    }
    yield* Effect.forEach(changes, reconciliation.apply, { discard: true });
    return { kind: "applied" as const };
  }, sql.withTransaction);

  return {
    /** Read a global value, falling back to its built-in default. */
    getGlobal,
    /** Read effective settings and their sources from one snapshot. */
    getEffective: (projectId: string) =>
      sql.withTransaction(readEffectiveSettings(settings, projectId)),
    /** Preview enabling automatic completion for active projects that inherit the global value. */
    previewGlobalAutoComplete: () => previewAutoComplete(undefined),
    /** Preview enabling automatic completion for one active project. */
    previewProjectAutoComplete: (projectId: string) => previewAutoComplete(projectId),
    /** Set a single global value, subject to project constraints and reconciliation. */
    setGlobal: <T>(definition: SettingDefinition<T>, value: T, approval?: ReconciliationApproval) =>
      updateGlobal(() => new Map([[definition.key, definition.format(value)]]), approval),
    /** Save the three global defaults together. */
    saveGlobal: (
      autoComplete: boolean,
      yellow: DurationTicks,
      red: DurationTicks,
      approval?: ReconciliationApproval,
    ) =>
      updateGlobal(
        () =>
          new Map([
            [autoCompleteParents.key, autoCompleteParents.format(autoComplete)],
            [urgencyYellowThreshold.key, urgencyYellowThreshold.format(yellow)],
            [urgencyRedThreshold.key, urgencyRedThreshold.format(red)],
          ]),
        approval,
      ),
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
