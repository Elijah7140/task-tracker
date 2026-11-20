import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const hours = (count: number) => String(BigInt(count) * 36_000_000_000n);
const days = (count: number) => hours(count * 24);
const disabledDefaults = {
  autoCompleteParents: false,
  urgencyYellowThreshold: days(3),
  urgencyRedThreshold: days(1),
  workspaceCardColumns: 4,
};
const inherit = {
  autoCompleteParents: null,
  urgencyYellowThreshold: null,
  urgencyRedThreshold: null,
};

const storedRows = (table: "GlobalSetting" | "ProjectSetting") =>
  Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql.withTransaction(sql`SELECT Key, Value FROM ${sql(table)} ORDER BY Key`),
  );

const setupProject = Effect.gen(function* () {
  const client = yield* connectRenderer;
  const project = yield* client.CreateProject({ name: "Billing DB" });
  return { client, project };
});

/** Disable automatic completion and leave a completed parent above an open child. */
const setupDisagreement = Effect.gen(function* () {
  const { client, project } = yield* setupProject;
  yield* client.SaveGlobalSettings({ settings: disabledDefaults });
  const area = { projectId: project.id, folderId: null };
  const createParentWithOpenChild = Effect.gen(function* () {
    const parent = yield* client.CreateItem({ ...area, parentItemId: null, title: "Parent" });
    yield* client.CreateItem({ ...area, parentItemId: parent.id, title: "Open child" });
    yield* client.SetItemCompleted({ ...area, itemId: parent.id, completed: true });
    return parent;
  });
  const parent = yield* createParentWithOpenChild;
  return { client, project, area, parent, createParentWithOpenChild };
});

/** The reminder defaults of a database that stores none (§7.12). */
const DEFAULT_REMINDERS = {
  remindersEnabled: true,
  defaultReminderOffset: "36000000000",
  dateOnlyReminderTime: "09:00:00",
};

/** {@link DEFAULT_REMINDERS} as a project inherits them. */
const INHERITED_REMINDERS = {
  remindersEnabled: { value: true, source: "Global" },
  defaultReminderOffset: { value: "36000000000", source: "Global" },
  dateOnlyReminderTime: { value: "09:00:00", source: "Global" },
};

it.effect("Reads and saves global defaults as exact tick strings stored in XmlConvert text", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const defaults = yield* client.LoadGlobalSettings();
      const settings = {
        autoCompleteParents: false,
        urgencyYellowThreshold: days(4),
        urgencyRedThreshold: hours(30),
        workspaceCardColumns: 6,
      };

      const result = yield* client.SaveGlobalSettings({ settings });
      const saved = yield* client.LoadGlobalSettings();

      expect(defaults).toEqual({
        autoCompleteParents: true,
        urgencyYellowThreshold: "2592000000000",
        urgencyRedThreshold: "864000000000",
        workspaceCardColumns: 4,
        reminders: DEFAULT_REMINDERS,
        keepRunningInTray: false,
        startWithSystem: false,
        addOpensDetails: { todo: false, ticket: false },
      });
      expect(result).toEqual({ kind: "applied" });
      expect(saved).toEqual({
        ...settings,
        reminders: DEFAULT_REMINDERS,
        keepRunningInTray: false,
        startWithSystem: false,
        addOpensDetails: { todo: false, ticket: false },
      });
      expect(yield* storedRows("GlobalSetting")).toEqual([
        { Key: "autoCompleteParents", Value: "false" },
        { Key: "urgencyRedThreshold", Value: "P1DT6H" },
        { Key: "urgencyYellowThreshold", Value: "P4D" },
        { Key: "workspaceCardColumns", Value: "6" },
      ]);
    }),
  ),
);

it.effect("Saves the tray choice with the global defaults and keeps it when a save omits it", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const defaults = yield* client.LoadGlobalSettings();

      yield* client.SaveGlobalSettings({ settings: { ...defaults, keepRunningInTray: true } });
      const { keepRunningInTray: _omitted, ...withoutTray } = defaults;
      yield* client.SaveGlobalSettings({
        settings: { ...withoutTray, autoCompleteParents: false },
      });
      const saved = yield* client.LoadGlobalSettings();

      expect(saved.keepRunningInTray).toBe(true);
      expect(saved.autoCompleteParents).toBe(false);
      expect(yield* storedRows("GlobalSetting")).toEqual([
        { Key: "autoCompleteParents", Value: "false" },
        { Key: "keepRunningInTray", Value: "true" },
      ]);
    }),
  ),
);

it.effect("Saves start with system outside undo history and keeps it when a save omits it", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const defaults = yield* client.LoadGlobalSettings();

      yield* client.SaveGlobalSettings({ settings: { ...defaults, startWithSystem: true } });
      const history = yield* client.GetHistory();
      const { startWithSystem: _omitted, ...withoutStartup } = defaults;
      yield* client.SaveGlobalSettings({
        settings: { ...withoutStartup, autoCompleteParents: false },
      });
      const saved = yield* client.LoadGlobalSettings();

      expect(history.undo).toBeNull();
      expect(saved.startWithSystem).toBe(true);
      expect(saved.autoCompleteParents).toBe(false);
      expect(yield* storedRows("GlobalSetting")).toEqual([
        { Key: "autoCompleteParents", Value: "false" },
        { Key: "startWithSystem", Value: "true" },
      ]);
    }),
  ),
);

it.effect("Overrides project settings with their source and resets one to the global value", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, project } = yield* setupProject;
      const projectId = project.id.toLowerCase();
      const overrides = {
        autoCompleteParents: false,
        urgencyYellowThreshold: days(6),
        urgencyRedThreshold: hours(12),
      };

      const inherited = yield* client.LoadProjectSettings({ projectId });
      yield* client.SaveProjectSettings({ projectId, overrides });
      const overridden = yield* client.LoadProjectSettings({ projectId });
      yield* client.SaveProjectSettings({
        projectId,
        overrides: { ...overrides, urgencyYellowThreshold: null },
      });
      const reset = yield* client.LoadProjectSettings({ projectId });

      expect(inherited).toEqual({
        projectId: project.id,
        autoCompleteParents: { value: true, source: "Global" },
        urgencyYellowThreshold: { value: days(3), source: "Global" },
        urgencyRedThreshold: { value: days(1), source: "Global" },
        reminders: INHERITED_REMINDERS,
      });
      expect(overridden).toEqual({
        projectId: project.id,
        autoCompleteParents: { value: false, source: "Project" },
        urgencyYellowThreshold: { value: days(6), source: "Project" },
        urgencyRedThreshold: { value: hours(12), source: "Project" },
        reminders: INHERITED_REMINDERS,
      });
      expect(reset.urgencyYellowThreshold).toEqual({ value: days(3), source: "Global" });
      expect(reset.urgencyRedThreshold).toEqual({ value: hours(12), source: "Project" });
      expect(yield* storedRows("ProjectSetting")).toEqual([
        { Key: "autoCompleteParents", Value: "false" },
        { Key: "urgencyRedThreshold", Value: "PT12H" },
      ]);
    }),
  ),
);

it.effect("Requires fresh confirmation when the affected parents change before approval", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, area, parent, createParentWithOpenChild } = yield* setupDisagreement;
      const request = { settings: { ...disabledDefaults, autoCompleteParents: true } };
      const previewed = yield* client.PreviewGlobalAutoComplete();
      const pending = yield* client.SaveGlobalSettings(request);
      expect(pending).toEqual({
        kind: "needs-confirmation",
        preview: {
          parentsToComplete: 0,
          parentsToReopen: 1,
          parentIdsToComplete: [],
          parentIdsToReopen: [parent.id],
        },
      });
      if (pending.kind !== "needs-confirmation") return;
      yield* client.SetItemCompleted({ ...area, itemId: parent.id, completed: false });
      const replacement = yield* createParentWithOpenChild;

      const stale = yield* client.SaveGlobalSettings({ ...request, approval: pending.preview });
      const unchanged = yield* client.LoadGlobalSettings();
      const beforeApproval = yield* client.LoadArea(area);

      expect(previewed).toEqual(pending.preview);
      expect(stale).toEqual({
        kind: "needs-confirmation",
        preview: {
          parentsToComplete: 0,
          parentsToReopen: 1,
          parentIdsToComplete: [],
          parentIdsToReopen: [replacement.id],
        },
      });
      expect(unchanged.autoCompleteParents).toBe(false);
      expect(beforeApproval.items.open[1]?.item).toMatchObject({
        id: replacement.id,
        completedAtUtc: "2026-11-13T12:00:00Z",
      });
      if (stale.kind !== "needs-confirmation") return;

      const applied = yield* client.SaveGlobalSettings({
        ...request,
        approval: {
          parentIdsToComplete: [],
          parentIdsToReopen: stale.preview.parentIdsToReopen.map((id) => id.toLowerCase()),
        },
      });
      const saved = yield* client.LoadGlobalSettings();
      const reconciled = yield* client.LoadArea(area);

      expect(applied).toEqual({ kind: "applied" });
      expect(saved.autoCompleteParents).toBe(true);
      expect(reconciled.items.open[1]?.item).toMatchObject({
        id: replacement.id,
        completedAtUtc: null,
      });
      expect(reconciled.settings.autoCompleteParents).toEqual({ value: true, source: "Global" });
    }),
  ),
);

it.effect("Persists nothing until a project override that enables completion is confirmed", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, project, area, parent } = yield* setupDisagreement;
      const request = {
        projectId: project.id,
        overrides: { ...inherit, autoCompleteParents: true, urgencyYellowThreshold: days(4) },
      };
      const preview = yield* client.PreviewProjectAutoComplete({ projectId: project.id });

      const cancelled = yield* client.SaveProjectSettings(request);
      const rowsBeforeApproval = yield* storedRows("ProjectSetting");
      yield* TestClock.adjust("1 second");
      const confirmed = yield* client.SaveProjectSettings({ ...request, approval: preview });
      const settings = yield* client.LoadProjectSettings({ projectId: project.id });
      const reconciled = yield* client.LoadArea(area);

      expect(cancelled).toEqual({ kind: "needs-confirmation", preview });
      expect(preview.parentIdsToReopen).toEqual([parent.id]);
      expect(rowsBeforeApproval).toEqual([]);
      expect(confirmed).toEqual({ kind: "applied" });
      expect(settings.autoCompleteParents).toEqual({ value: true, source: "Project" });
      expect(settings.urgencyYellowThreshold).toEqual({ value: days(4), source: "Project" });
      expect(reconciled.items.open[0]?.item).toMatchObject({ id: parent.id, completedAtUtc: null });
    }),
  ),
);

it.effect("Names the project whose override conflicts with a global threshold", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, project } = yield* setupProject;
      yield* client.SaveProjectSettings({
        projectId: project.id,
        overrides: { ...inherit, urgencyRedThreshold: days(2) },
      });

      const failure = yield* Effect.flip(
        client.SaveGlobalSettings({
          settings: {
            autoCompleteParents: true,
            urgencyYellowThreshold: days(1),
            urgencyRedThreshold: hours(12),
            workspaceCardColumns: 4,
          },
        }),
      );
      const unchanged = yield* client.LoadGlobalSettings();

      expect(failure).toEqual(
        expect.objectContaining({
          _tag: "RuleViolation",
          message:
            "Project 'Billing DB' overrides the red threshold to 2 days, so the yellow threshold can't be lower than it.",
        }),
      );
      expect(unchanged.urgencyYellowThreshold).toBe(days(3));
      expect(yield* storedRows("GlobalSetting")).toEqual([]);
    }),
  ),
);

it.effect("Rejects invalid project thresholds as a rule violation and saves nothing", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, project } = yield* setupProject;

      const failure = yield* Effect.flip(
        client.SaveProjectSettings({
          projectId: project.id,
          overrides: {
            autoCompleteParents: false,
            urgencyYellowThreshold: hours(10),
            urgencyRedThreshold: hours(20),
          },
        }),
      );

      expect(failure).toMatchObject({
        _tag: "RuleViolation",
        message: "Red threshold must be nonnegative and no greater than yellow.",
      });
      expect(yield* storedRows("ProjectSetting")).toEqual([]);
    }),
  ),
);

it.effect("Identifies a deleted project in settings reads, previews and saves", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const { client, project } = yield* setupProject;
      const projectId = project.id;
      yield* client.DeleteProject({ projectId });

      const read = yield* Effect.flip(client.LoadProjectSettings({ projectId }));
      const preview = yield* Effect.flip(client.PreviewProjectAutoComplete({ projectId }));
      const save = yield* Effect.flip(
        client.SaveProjectSettings({ projectId, overrides: inherit }),
      );

      expect(read).toMatchObject({ _tag: "NotFound", entity: "Project" });
      expect(preview).toMatchObject({ _tag: "NotFound", entity: "Project" });
      expect(save).toMatchObject({ _tag: "NotFound", entity: "Project" });
    }),
  ),
);

it.effect("Rolls back a failed confirmed save and lets the caller retry", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { client, area, parent } = yield* setupDisagreement;
      const request = { settings: { ...disabledDefaults, autoCompleteParents: true } };
      const approval = yield* client.PreviewGlobalAutoComplete();
      yield* sql`CREATE TRIGGER reject_reopen BEFORE UPDATE OF CompletedAtUtc ON TodoItem
        WHEN NEW.CompletedAtUtc IS NULL
        BEGIN SELECT RAISE(ABORT, 'reopen failed'); END`;

      const failure = yield* Effect.flip(client.SaveGlobalSettings({ ...request, approval }));
      const unchanged = yield* client.LoadGlobalSettings();
      const unreconciled = yield* client.LoadArea(area);
      yield* sql`DROP TRIGGER reject_reopen`;
      const retry = yield* client.SaveGlobalSettings({ ...request, approval });

      expect(failure).toMatchObject({
        _tag: "OperationFailed",
        message: "The operation could not be completed.",
      });
      expect(unchanged.autoCompleteParents).toBe(false);
      expect(unreconciled.items.open[0]?.item.completedAtUtc).not.toBeNull();
      expect(retry).toEqual({ kind: "applied" });
      expect((yield* client.LoadArea(area)).items.open[0]?.item).toMatchObject({
        id: parent.id,
        completedAtUtc: null,
      });
    }),
  ),
);

it.effect("Hides a malformed stored setting behind an operation failure", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const client = yield* connectRenderer;
      yield* sql`INSERT INTO GlobalSetting (Key, Value) VALUES ('urgencyRedThreshold', 'soon')`;

      const failure = yield* Effect.flip(client.LoadGlobalSettings());

      expect(failure).toMatchObject({
        _tag: "OperationFailed",
        message: "The operation could not be completed.",
      });
    }),
  ),
);
