import {
  type GlobalSettings,
  type ItemTypeProjection,
  NotFound,
  type PriorityLevelProjection,
  type ProjectSettingOverrides,
  type ProjectSettings,
  type ReconciliationApproval,
  RuleViolation,
  type SettingsReconciliationPreview,
  type SettingsSaveResult,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import { numberedPriorityHandlers, priorityLabel } from "./fake-priority-levels.js";

type Global = typeof GlobalSettings.Type;
type Overrides = typeof ProjectSettingOverrides.Type;
type Project = typeof ProjectSettings.Type;
type Preview = typeof SettingsReconciliationPreview.Type;
type Approval = typeof ReconciliationApproval.Type;
type SaveResult = typeof SettingsSaveResult.Type;
type ItemType = typeof ItemTypeProjection.Type;
type PriorityLevel = typeof PriorityLevelProjection.Type;

interface Disagreement {
  readonly parentIdsToComplete: ReadonlyArray<string>;
  readonly parentIdsToReopen: ReadonlyArray<string>;
}

/** Recorded auto-complete reconciliation committed with a settings save. */
export interface ReconciledProject {
  readonly projectId: string;
  readonly completed: ReadonlyArray<string>;
  readonly reopened: ReadonlyArray<string>;
}

/** Minimal project view needed by fake settings validation and previews. */
export interface SettingsProjectTarget {
  readonly summaries: ReadonlyArray<{
    readonly project: { readonly id: string; readonly name: string };
  }>;
  readonly find: (
    projectId: string,
  ) => Effect.Effect<
    { readonly project: { readonly id: string; readonly name: string } },
    NotFound
  >;
}

const TICKS_PER_HOUR = 36_000_000_000n;
const TICKS_PER_DAY = 24n * TICKS_PER_HOUR;
const DEFAULT_YELLOW = String(3n * TICKS_PER_DAY);
const DEFAULT_RED = String(TICKS_PER_DAY);
const INVALID_THRESHOLDS = "Red threshold must be nonnegative and no greater than yellow.";

const BUILT_IN_TYPES: ReadonlyArray<ItemType> = [
  {
    id: "019A0000-0000-7000-8000-000000000001",
    name: "Change",
    colorKey: null,
    iconKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 0,
  },
  {
    id: "019A0000-0000-7000-8000-000000000002",
    name: "Error",
    colorKey: null,
    iconKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 1,
  },
  {
    id: "019A0000-0000-7000-8000-000000000003",
    name: "Discussion",
    colorKey: null,
    iconKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 2,
  },
];

/** The seeded levels, with the IDs that seeded items use (`FAKE_LOOKUPS`), as on the real server. */
const BUILT_IN_PRIORITIES: ReadonlyArray<PriorityLevel> = [
  {
    id: "019A0000-0000-7000-8000-000000002000",
    name: "Critical",
    number: null,
    label: "Critical",
    colorKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 0,
  },
  {
    id: "019A0000-0000-7000-8000-000000002001",
    name: "High",
    number: null,
    label: "High",
    colorKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 1,
  },
  {
    id: "019A0000-0000-7000-8000-000000002002",
    name: "Medium",
    number: null,
    label: "Medium",
    colorKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 2,
  },
  {
    id: "019A0000-0000-7000-8000-000000002003",
    name: "Low",
    number: null,
    label: "Low",
    colorKey: null,
    isBuiltIn: true,
    isArchived: false,
    sortOrder: 3,
  },
];

function describeDuration(ticksText: string): string {
  const ticks = BigInt(ticksText);
  if (ticks >= TICKS_PER_DAY && ticks % TICKS_PER_DAY === 0n) {
    return `${ticks / TICKS_PER_DAY} days`;
  }
  const hours = Number(ticks) / Number(TICKS_PER_HOUR);
  return `${Number(hours.toFixed(2))} hours`;
}

function validPair(yellowText: string, redText: string): boolean {
  const red = BigInt(redText);
  return red >= 0n && red <= BigInt(yellowText);
}

function describeConflict(
  projectName: string,
  yellow: Project["urgencyYellowThreshold"],
  red: Project["urgencyRedThreshold"],
): string {
  if (yellow.source === "Project" && red.source === "Global") {
    return `Project '${projectName}' overrides the yellow threshold to ${describeDuration(yellow.value)}, so the red threshold can't exceed it.`;
  }
  if (red.source === "Project" && yellow.source === "Global") {
    return `Project '${projectName}' overrides the red threshold to ${describeDuration(red.value)}, so the yellow threshold can't be lower than it.`;
  }
  return `Project '${projectName}' would be left with invalid thresholds. ${INVALID_THRESHOLDS}`;
}

function sameIds(expected: ReadonlyArray<string>, approved: ReadonlyArray<string>): boolean {
  const normalized = approved.map((id) => id.toUpperCase()).toSorted();
  return (
    expected.length === normalized.length && normalized.every((id, index) => id === expected[index])
  );
}

function needsConfirmation(preview: Preview, approval: Approval | undefined): boolean {
  if (approval === undefined) {
    return preview.parentsToComplete > 0 || preview.parentsToReopen > 0;
  }
  return (
    !sameIds(preview.parentIdsToComplete, approval.parentIdsToComplete) ||
    !sameIds(preview.parentIdsToReopen, approval.parentIdsToReopen)
  );
}

function validateLookupName(
  name: string,
  kind: string,
  existing: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly isArchived: boolean;
  }>,
  excludeId?: string,
): Effect.Effect<string, RuleViolation> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || name.length > 300) {
    return Effect.fail(new RuleViolation({ message: "Name must be 1 to 300 characters." }));
  }
  const key = trimmed.toUpperCase();
  const duplicate = existing.find(
    (row) => row.id !== excludeId && row.name.trim().toUpperCase() === key,
  );
  if (duplicate?.isArchived) {
    const hint =
      excludeId === undefined ? "Restore it instead." : "Restore or rename that one first.";
    return Effect.fail(
      new RuleViolation({
        message: `The name '${trimmed}' is used by an archived ${kind}. ${hint}`,
      }),
    );
  }
  if (duplicate !== undefined) {
    return Effect.fail(
      new RuleViolation({ message: `The name '${trimmed}' is already used by another ${kind}.` }),
    );
  }
  return Effect.succeed(trimmed);
}

function reorderRows<Row extends { readonly id: string; readonly sortOrder: number }>(
  rows: ReadonlyArray<Row>,
  ids: ReadonlyArray<string>,
): Effect.Effect<Array<Row>, RuleViolation> {
  const normalized = ids.map((id) => id.toUpperCase());
  if (normalized.length !== rows.length || new Set(normalized).size !== normalized.length) {
    return Effect.fail(
      new RuleViolation({ message: "Order must contain every lookup exactly once." }),
    );
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: Array<Row> = [];
  for (const [sortOrder, id] of normalized.entries()) {
    const row = byId.get(id);
    if (row === undefined) {
      return Effect.fail(
        new RuleViolation({ message: "Order must contain every lookup exactly once." }),
      );
    }
    ordered.push({ ...row, sortOrder });
  }
  return Effect.succeed(ordered);
}

/** The reminder defaults of a fresh database (§7.12). */
export const DEFAULT_REMINDERS: NonNullable<Global["reminders"]> = {
  remindersEnabled: true,
  defaultReminderOffset: "36000000000",
  dateOnlyReminderTime: "09:00:00",
};

/** Reminder settings with sources, as the server resolves them. */
function effectiveReminders(
  global: NonNullable<Global["reminders"]>,
  overrides: Overrides["reminders"],
): NonNullable<Project["reminders"]> {
  const pick = <Value>(globalValue: Value, override: Value | null | undefined) =>
    override == null
      ? { value: globalValue, source: "Global" as const }
      : { value: override, source: "Project" as const };
  return {
    remindersEnabled: pick(global.remindersEnabled, overrides?.remindersEnabled),
    defaultReminderOffset: pick(global.defaultReminderOffset, overrides?.defaultReminderOffset),
    dateOnlyReminderTime: pick(global.dateOnlyReminderTime, overrides?.dateOnlyReminderTime),
  };
}

/**
 * In-memory settings, auto-complete disagreement and lookup store behind the
 * fake RPC server. Mirrors server validation, effective overrides, conflict
 * diagnostics and stale reconciliation checks.
 */
export class FakeSettingsAndLookups {
  globalSettings: Global = {
    autoCompleteParents: true,
    urgencyYellowThreshold: DEFAULT_YELLOW,
    urgencyRedThreshold: DEFAULT_RED,
    workspaceCardColumns: 4,
    reminders: DEFAULT_REMINDERS,
    keepRunningInTray: false,
    startWithSystem: false,
    addOpensDetails: { todo: false, ticket: false },
  };
  itemTypes: Array<ItemType> = BUILT_IN_TYPES.map((row) => ({ ...row }));
  priorityLevels: Array<PriorityLevel> = BUILT_IN_PRIORITIES.map((row) => ({ ...row }));
  readonly reconciledProjects: Array<ReconciledProject> = [];
  private readonly projectOverrides = new Map<string, Overrides>();
  private readonly disagreements = new Map<string, Disagreement>();

  constructor(private readonly nextId: () => string) {}

  /** Updates global defaults directly, as if persisted before the test. */
  setGlobalSettings(partial: Partial<Global>) {
    this.globalSettings = { ...this.globalSettings, ...partial };
  }

  /** Sets or clears overrides for one project directly. */
  setProjectOverrides(projectId: string, overrides: Partial<Overrides>) {
    const key = projectId.toUpperCase();
    const current = this.projectOverrides.get(key) ?? {
      autoCompleteParents: null,
      urgencyYellowThreshold: null,
      urgencyRedThreshold: null,
    };
    this.projectOverrides.set(key, {
      autoCompleteParents:
        overrides.autoCompleteParents !== undefined
          ? overrides.autoCompleteParents
          : current.autoCompleteParents,
      urgencyYellowThreshold:
        overrides.urgencyYellowThreshold !== undefined
          ? overrides.urgencyYellowThreshold
          : current.urgencyYellowThreshold,
      urgencyRedThreshold:
        overrides.urgencyRedThreshold !== undefined
          ? overrides.urgencyRedThreshold
          : current.urgencyRedThreshold,
      ...((overrides.reminders ?? current.reminders) === undefined
        ? {}
        : { reminders: overrides.reminders ?? current.reminders! }),
    });
  }

  /** Sets pending parent transitions for a project when auto-complete turns on. */
  setDisagreements(
    projectId: string,
    {
      parentIdsToComplete = [],
      parentIdsToReopen = [],
    }: {
      readonly parentIdsToComplete?: ReadonlyArray<string>;
      readonly parentIdsToReopen?: ReadonlyArray<string>;
    },
  ) {
    this.disagreements.set(projectId.toUpperCase(), {
      parentIdsToComplete: parentIdsToComplete.map((id) => id.toUpperCase()),
      parentIdsToReopen: parentIdsToReopen.map((id) => id.toUpperCase()),
    });
  }

  /** Resolves effective settings with sources for a project. */
  getEffective(
    projectId: string,
    global: Global = this.globalSettings,
    override?: Overrides,
  ): Project {
    const stored = override ?? this.projectOverrides.get(projectId.toUpperCase());
    return {
      reminders: effectiveReminders(global.reminders ?? DEFAULT_REMINDERS, stored?.reminders),
      projectId: projectId.toUpperCase(),
      autoCompleteParents:
        stored?.autoCompleteParents != null
          ? { value: stored.autoCompleteParents, source: "Project" }
          : { value: global.autoCompleteParents, source: "Global" },
      urgencyYellowThreshold:
        stored?.urgencyYellowThreshold != null
          ? { value: stored.urgencyYellowThreshold, source: "Project" }
          : { value: global.urgencyYellowThreshold, source: "Global" },
      urgencyRedThreshold:
        stored?.urgencyRedThreshold != null
          ? { value: stored.urgencyRedThreshold, source: "Project" }
          : { value: global.urgencyRedThreshold, source: "Global" },
    };
  }

  /** Seeds a custom item type before or during a test. */
  addItemTypeSeed(name: string, options?: { readonly isArchived?: boolean }): ItemType {
    const row: ItemType = {
      id: this.nextId(),
      name,
      colorKey: null,
      iconKey: null,
      isBuiltIn: false,
      isArchived: options?.isArchived ?? false,
      sortOrder: this.itemTypes.length,
    };
    this.itemTypes.push(row);
    return row;
  }

  /** Seeds a custom priority level before or during a test. */
  addPriorityLevelSeed(
    name: string,
    options?: { readonly isArchived?: boolean; readonly number?: number },
  ): PriorityLevel {
    const number = options?.number ?? null;
    const row: PriorityLevel = {
      id: this.nextId(),
      name,
      number,
      label: priorityLabel(name, number),
      colorKey: null,
      isBuiltIn: false,
      isArchived: options?.isArchived ?? false,
      sortOrder: this.priorityLevels.length,
    };
    this.priorityLevels.push(row);
    return row;
  }

  /** Returns item type names in current sort order. */
  itemTypeNames(includeArchived = false): ReadonlyArray<string> {
    return this.itemTypes
      .filter((row) => includeArchived || !row.isArchived)
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => row.name);
  }

  /** Returns priority level names in current sort order. */
  priorityLevelNames(includeArchived = false): ReadonlyArray<string> {
    return this.priorityLevels
      .filter((row) => includeArchived || !row.isArchived)
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => row.name);
  }

  /** Builds a reconciliation preview across the given project IDs. */
  previewForProjects(projectIds: ReadonlyArray<string>): Preview {
    const toComplete: Array<string> = [];
    const toReopen: Array<string> = [];
    for (const id of projectIds) {
      const entry = this.disagreements.get(id.toUpperCase());
      if (entry !== undefined) {
        toComplete.push(...entry.parentIdsToComplete);
        toReopen.push(...entry.parentIdsToReopen);
      }
    }
    toComplete.sort();
    toReopen.sort();
    return {
      parentsToComplete: toComplete.length,
      parentsToReopen: toReopen.length,
      parentIdsToComplete: toComplete,
      parentIdsToReopen: toReopen,
    };
  }

  /** Records reconciliation and clears disagreements for applied projects. */
  applyReconciliation(projectIds: ReadonlyArray<string>) {
    for (const projectId of projectIds) {
      const key = projectId.toUpperCase();
      const entry = this.disagreements.get(key);
      if (
        entry !== undefined &&
        (entry.parentIdsToComplete.length > 0 || entry.parentIdsToReopen.length > 0)
      ) {
        this.reconciledProjects.push({
          projectId: key,
          completed: [...entry.parentIdsToComplete],
          reopened: [...entry.parentIdsToReopen],
        });
        this.disagreements.delete(key);
      }
    }
  }

  saveGlobal(
    store: SettingsProjectTarget,
    next: Global,
    approval: Approval | undefined,
  ): Effect.Effect<SaveResult, RuleViolation> {
    if (!validPair(next.urgencyYellowThreshold, next.urgencyRedThreshold)) {
      return Effect.fail(new RuleViolation({ message: INVALID_THRESHOLDS }));
    }
    const enabledProjects: Array<string> = [];
    for (const { project } of store.summaries) {
      const previous = this.getEffective(project.id);
      const proposed = this.getEffective(project.id, next);
      if (!validPair(proposed.urgencyYellowThreshold.value, proposed.urgencyRedThreshold.value)) {
        return Effect.fail(
          new RuleViolation({
            message: describeConflict(
              project.name,
              proposed.urgencyYellowThreshold,
              proposed.urgencyRedThreshold,
            ),
          }),
        );
      }
      if (!previous.autoCompleteParents.value && proposed.autoCompleteParents.value) {
        enabledProjects.push(project.id);
      }
    }
    const preview = this.previewForProjects(enabledProjects);
    if (needsConfirmation(preview, approval)) {
      return Effect.succeed({ kind: "needs-confirmation", preview });
    }
    const reminders = next.reminders ?? this.globalSettings.reminders;
    const keepRunningInTray = next.keepRunningInTray ?? this.globalSettings.keepRunningInTray;
    const startWithSystem = next.startWithSystem ?? this.globalSettings.startWithSystem;
    const addOpensDetails = next.addOpensDetails ?? this.globalSettings.addOpensDetails;
    this.globalSettings = {
      ...next,
      ...(addOpensDetails === undefined ? {} : { addOpensDetails }),
      ...(reminders === undefined ? {} : { reminders }),
      ...(keepRunningInTray === undefined ? {} : { keepRunningInTray }),
      ...(startWithSystem === undefined ? {} : { startWithSystem }),
    };
    this.applyReconciliation(enabledProjects);
    return Effect.succeed({ kind: "applied" });
  }

  saveProject(
    store: SettingsProjectTarget,
    projectId: string,
    overrides: Overrides,
    approval: Approval | undefined,
  ): Effect.Effect<SaveResult, RuleViolation | NotFound> {
    return store.find(projectId).pipe(
      Effect.flatMap(({ project }): Effect.Effect<SaveResult, RuleViolation> => {
        const previous = this.getEffective(project.id);
        const proposed = this.getEffective(project.id, this.globalSettings, overrides);
        if (!validPair(proposed.urgencyYellowThreshold.value, proposed.urgencyRedThreshold.value)) {
          return Effect.fail(new RuleViolation({ message: INVALID_THRESHOLDS }));
        }
        const turnsOn = !previous.autoCompleteParents.value && proposed.autoCompleteParents.value;
        const affected = turnsOn ? [project.id] : [];
        const preview = this.previewForProjects(affected);
        if (needsConfirmation(preview, approval)) {
          return Effect.succeed({ kind: "needs-confirmation", preview });
        }
        const reminders = overrides.reminders ?? this.projectOverrides.get(project.id)?.reminders;
        this.projectOverrides.set(project.id, {
          ...overrides,
          ...(reminders === undefined ? {} : { reminders }),
        });
        this.applyReconciliation(affected);
        return Effect.succeed({ kind: "applied" });
      }),
    );
  }
}

function settingsHandlers(
  store: SettingsProjectTarget & { readonly settingsAndLookups: FakeSettingsAndLookups },
  record: (tag: string) => Effect.Effect<unknown>,
) {
  const data = store.settingsAndLookups;
  return {
    LoadGlobalSettings: () =>
      record("LoadGlobalSettings").pipe(Effect.map(() => ({ ...data.globalSettings }))),
    LoadProjectSettings: ({ projectId }: { readonly projectId: string }) =>
      record("LoadProjectSettings").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(({ project }) => data.getEffective(project.id)),
      ),
    PreviewGlobalAutoComplete: () =>
      record("PreviewGlobalAutoComplete").pipe(
        Effect.map(() => {
          const inheriting = store.summaries
            .map(({ project }) => project.id)
            .filter((id) => {
              const eff = data.getEffective(id).autoCompleteParents;
              return !eff.value && eff.source === "Global";
            });
          return data.previewForProjects(inheriting);
        }),
      ),
    PreviewProjectAutoComplete: ({ projectId }: { readonly projectId: string }) =>
      record("PreviewProjectAutoComplete").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(({ project }) => {
          const current = data.getEffective(project.id).autoCompleteParents.value;
          return data.previewForProjects(current ? [] : [project.id]);
        }),
      ),
    SaveGlobalSettings: ({
      settings,
      approval,
    }: {
      readonly settings: Global;
      readonly approval?: Approval | undefined;
    }) =>
      record("SaveGlobalSettings").pipe(Effect.andThen(data.saveGlobal(store, settings, approval))),
    SaveProjectSettings: ({
      projectId,
      overrides,
      approval,
    }: {
      readonly projectId: string;
      readonly overrides: Overrides;
      readonly approval?: Approval | undefined;
    }) =>
      record("SaveProjectSettings").pipe(
        Effect.andThen(data.saveProject(store, projectId, overrides, approval)),
      ),
  };
}

interface LookupStoreOps<Row> {
  readonly list: () => Effect.Effect<Array<Row>, never>;
  readonly add: (payload: { readonly name: string }) => Effect.Effect<Row, RuleViolation>;
  readonly rename: (payload: {
    readonly id: string;
    readonly name: string;
  }) => Effect.Effect<void, RuleViolation>;
  readonly archive: (payload: { readonly id: string }) => Effect.Effect<void, RuleViolation>;
  readonly restore: (payload: { readonly id: string }) => Effect.Effect<void, RuleViolation>;
  readonly reorder: (payload: {
    readonly ids: ReadonlyArray<string>;
  }) => Effect.Effect<void, RuleViolation>;
}

function createLookupOps<
  Row extends {
    readonly id: string;
    readonly name: string;
    readonly isBuiltIn: boolean;
    readonly isArchived: boolean;
    readonly sortOrder: number;
  },
>(
  rpcPrefix: string,
  kindLabel: string,
  getRows: () => Array<Row>,
  setRows: (next: Array<Row>) => void,
  createRow: (name: string, sortOrder: number) => Row,
  blockBuiltInArchive: boolean,
  record: (tag: string) => Effect.Effect<unknown>,
): LookupStoreOps<Row> {
  const findRow = (id: string) => {
    const key = id.toUpperCase();
    const row = getRows().find((candidate) => candidate.id === key);
    return row === undefined
      ? Effect.fail(new RuleViolation({ message: "Lookup was not found." }))
      : Effect.succeed(row);
  };
  return {
    list: () =>
      record(`List${rpcPrefix}s`).pipe(
        Effect.map(() => getRows().toSorted((a, b) => a.sortOrder - b.sortOrder)),
      ),
    add: ({ name }) =>
      record(`Add${rpcPrefix}`).pipe(
        Effect.andThen(validateLookupName(name, kindLabel, getRows())),
        Effect.map((trimmed) => {
          const row = createRow(trimmed, getRows().length);
          setRows([...getRows(), row]);
          return row;
        }),
      ),
    rename: ({ id, name }) =>
      record(`Rename${rpcPrefix}`).pipe(
        Effect.andThen(findRow(id)),
        Effect.flatMap((row) =>
          validateLookupName(name, kindLabel, getRows(), row.id).pipe(
            Effect.map((trimmed) => ({ row, trimmed })),
          ),
        ),
        Effect.map(({ row, trimmed }) => {
          setRows(
            getRows().map((candidate) =>
              candidate.id === row.id ? { ...candidate, name: trimmed } : candidate,
            ),
          );
        }),
      ),
    archive: ({ id }) =>
      record(`Archive${rpcPrefix}`).pipe(
        Effect.andThen(findRow(id)),
        Effect.flatMap((row) => {
          if (blockBuiltInArchive && row.isBuiltIn) {
            return Effect.fail(
              new RuleViolation({ message: "Built-in item types cannot be archived." }),
            );
          }
          setRows(
            getRows().map((candidate) =>
              candidate.id === row.id ? { ...candidate, isArchived: true } : candidate,
            ),
          );
          return Effect.void;
        }),
      ),
    restore: ({ id }) =>
      record(`Restore${rpcPrefix}`).pipe(
        Effect.andThen(findRow(id)),
        Effect.map((row) => {
          setRows(
            getRows().map((candidate) =>
              candidate.id === row.id ? { ...candidate, isArchived: false } : candidate,
            ),
          );
        }),
      ),
    reorder: ({ ids }) =>
      record(`Reorder${rpcPrefix}s`).pipe(
        Effect.andThen(reorderRows(getRows(), ids)),
        Effect.map((ordered) => {
          setRows(ordered);
        }),
      ),
  };
}

/** Builds settings and lookup RPC handlers backed by `store.settingsAndLookups`. */
export function settingsAndLookupHandlers(
  store: SettingsProjectTarget & {
    readonly nextId: () => string;
    readonly settingsAndLookups: FakeSettingsAndLookups;
  },
  record: (tag: string) => Effect.Effect<unknown>,
) {
  const data = store.settingsAndLookups;
  const types = createLookupOps<ItemType>(
    "ItemType",
    "item type",
    () => data.itemTypes,
    (next) => {
      data.itemTypes = next;
    },
    (name, sortOrder) => ({
      id: store.nextId(),
      name,
      colorKey: null,
      iconKey: null,
      isBuiltIn: false,
      isArchived: false,
      sortOrder,
    }),
    true,
    record,
  );
  const levels = createLookupOps<PriorityLevel>(
    "PriorityLevel",
    "priority level",
    () => data.priorityLevels,
    (next) => {
      data.priorityLevels = next;
    },
    (name, sortOrder) => ({
      id: store.nextId(),
      name,
      number: null,
      label: name,
      colorKey: null,
      isBuiltIn: false,
      isArchived: false,
      sortOrder,
    }),
    false,
    record,
  );
  const numbered = numberedPriorityHandlers(
    {
      rows: () => data.priorityLevels,
      setRows: (next) => {
        data.priorityLevels = next;
      },
      nextId: store.nextId,
      validateName: (name, excludeId) =>
        validateLookupName(name, "priority level", data.priorityLevels, excludeId),
    },
    record,
  );
  return {
    ...settingsHandlers(store, record),
    ListItemTypes: types.list,
    AddItemType: types.add,
    RenameItemType: types.rename,
    ArchiveItemType: types.archive,
    RestoreItemType: types.restore,
    ReorderItemTypes: types.reorder,
    ListPriorityLevels: levels.list,
    ArchivePriorityLevel: levels.archive,
    ReorderPriorityLevels: levels.reorder,
    ...numbered,
  };
}
