import { expect, it } from "@effect/vitest";
import { SettingsCatalogue } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { SettingsService } from "../../../src/services/settings-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { withSchema } from "./fixtures.js";

const { autoCompleteParents, urgencyYellowThreshold, urgencyRedThreshold } = SettingsCatalogue;
const hour = 36_000_000_000n;
const day = 24n * hour;
const withServices = Effect.provide(
  Layer.mergeAll(
    SettingsService.layer,
    ProjectService.layer("UTC"),
    FolderService.layer,
    ItemService.layer("UTC"),
  ),
);

const completedParentWithOpenChild = Effect.fnUntraced(function* (
  projectId: string,
  folderId: string | null = null,
) {
  const items = yield* ItemService;
  const parent = yield* items.create(projectId, folderId, null, "Parent");
  const child = yield* items.create(projectId, folderId, parent.id, "Open child");
  yield* items.setCompleted(projectId, folderId, parent.id, true);
  return { parent, child };
});

const setupReconciliation = Effect.gen(function* () {
  const projects = yield* ProjectService;
  const settings = yield* SettingsService;
  const project = yield* projects.create("Billing DB");
  yield* settings.setGlobal(autoCompleteParents, false);
  const { parent, child } = yield* completedParentWithOpenChild(project.id);
  return { project, parent, child };
});

const readCompletedAt = Effect.fnUntraced(function* (
  projectId: string,
  itemId: string,
  folderId: string | null = null,
) {
  const items = yield* ItemService;
  const area = yield* items.loadArea(projectId, folderId);
  const item = [...area.items.open, ...area.items.finished].find((node) => node.item.id === itemId);
  if (item === undefined) {
    throw new Error("Expected the parent in the persisted area.");
  }
  return item.item.completedAtUtc;
});

const globalRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(sql`SELECT Key, Value FROM GlobalSetting ORDER BY Key`);
});

const projectRows = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(sql`SELECT Key, Value FROM ProjectSetting ORDER BY Key`);
});

it.effect("Global threshold validation includes deleted project overrides", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Project");
    yield* settings.setProjectOverride(project.id, urgencyRedThreshold, 36n * hour);
    const batch = yield* projects.delete(project.id);

    const failure = yield* Effect.flip(settings.setGlobal(urgencyYellowThreshold, 30n * hour));
    yield* projects.restore(batch);

    expect(failure).toBeInstanceOf(Error);
    expect((yield* projects.loadWorkspace(project.id)).name).toBe("Project");
    expect(yield* settings.getGlobal(urgencyYellowThreshold)).toBe(3n * day);
  }).pipe(withServices, withSchema),
);

it.effect("Enabling auto-completion reconciles items with the setting", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;

    const preview = yield* settings.previewGlobalAutoComplete();
    const unconfirmed = yield* settings.setGlobal(autoCompleteParents, true);
    const confirmed = yield* settings.setGlobal(autoCompleteParents, true, preview);

    expect(preview.parentsToReopen).toBe(1);
    expect(unconfirmed).toEqual({ kind: "needs-confirmation", preview });
    expect(confirmed.kind).toBe("applied");
    expect(yield* settings.getGlobal(autoCompleteParents)).toBe(true);
    expect(yield* readCompletedAt(project.id, parent.id)).toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("A project override wins and clearing it restores the global source", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Project");
    yield* settings.setGlobal(urgencyYellowThreshold, 5n * day);

    yield* settings.setProjectOverride(project.id, urgencyYellowThreshold, 2n * day);
    const overridden = yield* settings.getEffective(project.id);
    yield* settings.clearProjectOverride(project.id, urgencyYellowThreshold);
    const inherited = yield* settings.getEffective(project.id);

    expect(overridden.urgencyYellowThreshold).toEqual({ value: 2n * day, source: "Project" });
    expect(inherited.urgencyYellowThreshold).toEqual({ value: 5n * day, source: "Global" });
  }).pipe(withServices, withSchema),
);

it.effect("A global threshold that breaks a project override saves nothing", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Project");
    yield* settings.setProjectOverride(project.id, urgencyRedThreshold, 2n * day);

    yield* Effect.flip(settings.setGlobal(urgencyYellowThreshold, day));
    const saved = yield* settings.getEffective(project.id);

    expect(saved.urgencyYellowThreshold.value).toBe(3n * day);
    expect(saved.urgencyRedThreshold.value).toBe(2n * day);
    expect(yield* globalRows).toEqual([]);
  }).pipe(withServices, withSchema),
);

it.effect("Global enabling reconciles inheriting projects and skips disabled overrides", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;
    const overridden = yield* projects.create("Overridden");
    yield* settings.setProjectOverride(overridden.id, autoCompleteParents, false);
    const { parent: overriddenParent } = yield* completedParentWithOpenChild(overridden.id);

    const preview = yield* settings.previewGlobalAutoComplete();
    const result = yield* settings.setGlobal(autoCompleteParents, true);
    const beforeConfirmation = yield* settings.getGlobal(autoCompleteParents);
    yield* settings.setGlobal(autoCompleteParents, true, preview);

    expect(preview.parentsToReopen).toBe(1);
    expect(result.kind).toBe("needs-confirmation");
    expect(beforeConfirmation).toBe(false);
    expect(yield* readCompletedAt(project.id, parent.id)).toBeNull();
    expect(yield* readCompletedAt(overridden.id, overriddenParent.id)).not.toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Saving global defaults persists all three values together", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;

    yield* settings.saveGlobal(false, 5n * day, 48n * hour);

    expect(yield* settings.getGlobal(autoCompleteParents)).toBe(false);
    expect(yield* settings.getGlobal(urgencyYellowThreshold)).toBe(5n * day);
    expect(yield* settings.getGlobal(urgencyRedThreshold)).toBe(48n * hour);
    expect(yield* globalRows).toEqual([
      { Key: "autoCompleteParents", Value: "false" },
      { Key: "urgencyRedThreshold", Value: "P2D" },
      { Key: "urgencyYellowThreshold", Value: "P5D" },
    ]);
  }).pipe(withServices, withSchema),
);

it.effect("Saving global defaults with invalid thresholds persists nothing", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;

    const failure = yield* Effect.flip(settings.saveGlobal(false, day, 48n * hour));

    expect(failure.message).toBe("Red threshold must be nonnegative and no greater than yellow.");
    expect(yield* globalRows).toEqual([]);
  }).pipe(withServices, withSchema),
);

it.effect("A conflict with a yellow override names the project and threshold", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Billing DB");
    yield* settings.setProjectOverride(project.id, urgencyYellowThreshold, 36n * hour);

    const failure = yield* Effect.flip(settings.saveGlobal(true, 3n * day, 48n * hour));

    expect(failure.message).toBe(
      "Project 'Billing DB' overrides the yellow threshold to 36 hours, so the red threshold can't exceed it.",
    );
  }).pipe(withServices, withSchema),
);

it.effect("A conflict with a red override names the project and threshold", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Billing DB");
    yield* settings.setProjectOverride(project.id, urgencyRedThreshold, 2n * day);

    const failure = yield* Effect.flip(settings.saveGlobal(true, day, 12n * hour));

    expect(failure.message).toBe(
      "Project 'Billing DB' overrides the red threshold to 2 days, so the yellow threshold can't be lower than it.",
    );
  }).pipe(withServices, withSchema),
);

it.effect("Canceling a global reconciliation leaves settings and completion unchanged", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;

    const result = yield* settings.saveGlobal(true, 4n * day, 30n * hour);

    expect(result.kind).toBe("needs-confirmation");
    expect(yield* settings.getGlobal(autoCompleteParents)).toBe(false);
    expect(yield* settings.getGlobal(urgencyYellowThreshold)).toBe(3n * day);
    expect(yield* settings.getGlobal(urgencyRedThreshold)).toBe(day);
    expect(yield* readCompletedAt(project.id, parent.id)).not.toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("A confirmed global save commits settings and reconciliation together", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;
    const preview = yield* settings.previewGlobalAutoComplete();

    const result = yield* settings.saveGlobal(true, 4n * day, 30n * hour, preview);

    expect(result.kind).toBe("applied");
    expect(yield* settings.getGlobal(autoCompleteParents)).toBe(true);
    expect(yield* settings.getGlobal(urgencyYellowThreshold)).toBe(4n * day);
    expect(yield* settings.getGlobal(urgencyRedThreshold)).toBe(30n * hour);
    expect(yield* readCompletedAt(project.id, parent.id)).toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Saving project overrides persists all three together and null clears one", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Billing DB");

    yield* settings.saveProject(project.id, false, 6n * day, 12n * hour);
    const overridden = yield* settings.getEffective(project.id);
    yield* settings.saveProject(project.id, false, null, 12n * hour);
    const inherited = yield* settings.getEffective(project.id);

    expect(overridden.urgencyYellowThreshold).toEqual({ value: 6n * day, source: "Project" });
    expect(inherited).toEqual({
      autoCompleteParents: { value: false, source: "Project" },
      urgencyYellowThreshold: { value: 3n * day, source: "Global" },
      urgencyRedThreshold: { value: 12n * hour, source: "Project" },
      workspaceCardColumns: { value: 4, source: "Global" },
    });
  }).pipe(withServices, withSchema),
);

it.effect("Saving invalid project thresholds persists nothing", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Billing DB");

    yield* Effect.flip(settings.saveProject(project.id, false, 10n * hour, 20n * hour));

    expect(yield* projectRows).toEqual([]);
  }).pipe(withServices, withSchema),
);

it.effect(
  "A project save that enables auto-completion needs confirmation and then reconciles",
  () =>
    Effect.gen(function* () {
      const settings = yield* SettingsService;
      const { project, parent } = yield* setupReconciliation;

      const preview = yield* settings.previewProjectAutoComplete(project.id);
      const unconfirmed = yield* settings.saveProject(project.id, true, 4n * day, null);
      const beforeConfirmation = yield* projectRows;
      const confirmed = yield* settings.saveProject(project.id, true, 4n * day, null, preview);

      expect(unconfirmed).toEqual({ kind: "needs-confirmation", preview });
      expect(beforeConfirmation).toEqual([]);
      expect(confirmed.kind).toBe("applied");
      expect(yield* readCompletedAt(project.id, parent.id)).toBeNull();
      expect((yield* settings.getEffective(project.id)).urgencyYellowThreshold.value).toBe(
        4n * day,
      );
    }).pipe(withServices, withSchema),
);

it.effect("Clearing a disabled override previews bottom-up completion in active areas", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const folders = yield* FolderService;
    const items = yield* ItemService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Project");
    yield* settings.setProjectOverride(project.id, autoCompleteParents, false);
    const active = yield* folders.create(project.id, null, "Active");
    const trashed = yield* folders.create(project.id, null, "Trashed");
    const root = yield* items.create(project.id, active.id, null, "Root");
    const middle = yield* items.create(project.id, active.id, root.id, "Middle");
    const leaf = yield* items.create(project.id, active.id, middle.id, "Leaf");
    yield* items.setCompleted(project.id, active.id, leaf.id, true);
    yield* completedParentWithOpenChild(project.id, trashed.id);
    yield* folders.delete(project.id, trashed.id);

    const pending = yield* settings.clearProjectOverride(project.id, autoCompleteParents);
    if (pending.kind !== "needs-confirmation") {
      throw new Error("Expected the override reset to require confirmation.");
    }
    const { preview } = pending;
    yield* settings.clearProjectOverride(project.id.toLowerCase(), autoCompleteParents, preview);
    const area = yield* items.loadArea(project.id, active.id);

    expect(preview.parentsToComplete).toBe(2);
    expect(preview.parentsToReopen).toBe(0);
    expect(new Set(preview.parentIdsToComplete)).toEqual(new Set([root.id, middle.id]));
    expect(area.items.finished[0]?.item.completedAtUtc).toBeInstanceOf(Temporal.Instant);
    expect(area.items.finished[0]?.children.finished[0]?.item.completedAtUtc).toBeInstanceOf(
      Temporal.Instant,
    );
    expect(area.settings.autoCompleteParents).toEqual({ value: true, source: "Global" });
  }).pipe(withServices, withSchema),
);

it.effect(
  "An approval for a different parent requires fresh confirmation even with the same counts",
  () =>
    Effect.gen(function* () {
      const items = yield* ItemService;
      const settings = yield* SettingsService;
      const { project, parent } = yield* setupReconciliation;
      const previous = yield* settings.previewGlobalAutoComplete();
      yield* items.setCompleted(project.id, null, parent.id, false);
      const { parent: replacement } = yield* completedParentWithOpenChild(project.id);

      const result = yield* settings.saveGlobal(true, 4n * day, day, previous);

      expect(result).toEqual({
        kind: "needs-confirmation",
        preview: {
          parentsToComplete: 0,
          parentsToReopen: 1,
          parentIdsToComplete: [],
          parentIdsToReopen: [replacement.id],
        },
      });
      expect(yield* settings.getGlobal(autoCompleteParents)).toBe(false);
      expect(yield* settings.getGlobal(urgencyYellowThreshold)).toBe(3n * day);
      expect(yield* readCompletedAt(project.id, replacement.id)).not.toBeNull();
    }).pipe(withServices, withSchema),
);

it.effect("Confirmation revalidates thresholds against newly written overrides", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;
    const preview = yield* settings.previewGlobalAutoComplete();
    yield* settings.setProjectOverride(project.id, urgencyRedThreshold, 2n * day);

    const failure = yield* Effect.flip(settings.saveGlobal(true, day, day, preview));

    expect(failure.message).toContain("Billing DB");
    expect(yield* settings.getGlobal(autoCompleteParents)).toBe(false);
    expect(yield* readCompletedAt(project.id, parent.id)).not.toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect(
  "Confirmed global auto-complete enable with invalid thresholds against a project override persists nothing",
  () =>
    Effect.gen(function* () {
      const settings = yield* SettingsService;
      const { project, parent } = yield* setupReconciliation;
      yield* settings.setProjectOverride(project.id, urgencyYellowThreshold, 2n * day);
      const preview = yield* settings.previewGlobalAutoComplete();

      const failure = yield* Effect.flip(settings.saveGlobal(true, 4n * day, 72n * hour, preview));

      expect(failure.message).toBe(
        "Project 'Billing DB' overrides the yellow threshold to 2 days, so the red threshold can't exceed it.",
      );
      expect(yield* settings.getGlobal(autoCompleteParents)).toBe(false);
      expect(yield* settings.getGlobal(urgencyYellowThreshold)).toBe(3n * day);
      expect(yield* settings.getGlobal(urgencyRedThreshold)).toBe(day);
      expect(yield* readCompletedAt(project.id, parent.id)).not.toBeNull();
    }).pipe(withServices, withSchema),
);

it.effect(
  "Confirmed project auto-complete enable with invalid thresholds against global yellow persists nothing",
  () =>
    Effect.gen(function* () {
      const projects = yield* ProjectService;
      const settings = yield* SettingsService;
      const project = yield* projects.create("Billing DB");
      yield* settings.setProjectOverride(project.id, autoCompleteParents, false);
      const { parent } = yield* completedParentWithOpenChild(project.id);
      yield* settings.setGlobal(urgencyYellowThreshold, day);
      const preview = yield* settings.previewProjectAutoComplete(project.id);

      const failure = yield* Effect.flip(
        settings.saveProject(project.id, true, null, 48n * hour, preview),
      );

      expect(failure.message).toBe("Red threshold must be nonnegative and no greater than yellow.");
      const effective = yield* settings.getEffective(project.id);
      expect(effective.autoCompleteParents).toEqual({ value: false, source: "Project" });
      expect(effective.urgencyRedThreshold).toEqual({ value: day, source: "Global" });
      expect(yield* readCompletedAt(project.id, parent.id)).not.toBeNull();
    }).pipe(withServices, withSchema),
);

it.effect("A failed reconciliation rolls back all setting and completion writes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;
    const { parent: other } = yield* completedParentWithOpenChild(project.id);
    const preview = yield* settings.previewGlobalAutoComplete();
    yield* sql`CREATE TRIGGER reject_second_reopen BEFORE UPDATE OF CompletedAtUtc ON TodoItem
      WHEN NEW.CompletedAtUtc IS NULL AND OLD.CompletedAtUtc IS NOT NULL
        AND (SELECT COUNT(*) FROM TodoItem WHERE CompletedAtUtc IS NOT NULL) = 1
      BEGIN SELECT RAISE(ABORT, 'cannot reopen second parent'); END`;

    yield* Effect.flip(settings.saveGlobal(true, 4n * day, 30n * hour, preview));

    expect(preview.parentsToReopen).toBe(2);
    expect(yield* globalRows).toEqual([{ Key: "autoCompleteParents", Value: "false" }]);
    expect(yield* readCompletedAt(project.id, parent.id)).not.toBeNull();
    expect(yield* readCompletedAt(project.id, other.id)).not.toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Enabling auto-completion with a consistent tree applies without confirmation", () =>
  Effect.gen(function* () {
    const items = yield* ItemService;
    const settings = yield* SettingsService;
    const { project, parent } = yield* setupReconciliation;
    yield* items.setCompleted(project.id, null, parent.id, false);

    const result = yield* settings.setProjectOverride(project.id, autoCompleteParents, true);

    expect(result.kind).toBe("applied");
    expect((yield* settings.getEffective(project.id)).autoCompleteParents).toEqual({
      value: true,
      source: "Project",
    });
    expect(yield* readCompletedAt(project.id, parent.id)).toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Fractional durations written to overrides retain their XmlConvert text", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Project");

    yield* settings.setProjectOverride(project.id, urgencyRedThreshold, 5_000_000n);

    expect(yield* projectRows).toEqual([{ Key: "urgencyRedThreshold", Value: "PT0.5S" }]);
    expect((yield* settings.getEffective(project.id)).urgencyRedThreshold).toEqual({
      value: 5_000_000n,
      source: "Project",
    });
  }).pipe(withServices, withSchema),
);

it.effect("Global settings read every stored value and default the rest in one snapshot", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    yield* settings.setGlobal(urgencyRedThreshold, 12n * hour);

    const global = yield* settings.getGlobalSettings();

    expect(global).toEqual({
      autoCompleteParents: { value: true, source: "Global" },
      urgencyYellowThreshold: { value: 3n * day, source: "Global" },
      urgencyRedThreshold: { value: 12n * hour, source: "Global" },
      workspaceCardColumns: { value: 4, source: "Global" },
    });
  }).pipe(withServices, withSchema),
);

it.effect("Effective settings and project previews identify a deleted project", () =>
  Effect.gen(function* () {
    const projects = yield* ProjectService;
    const settings = yield* SettingsService;
    const project = yield* projects.create("Project");
    yield* projects.delete(project.id);

    const read = yield* Effect.flip(settings.getEffective(project.id));
    const preview = yield* Effect.flip(settings.previewProjectAutoComplete(project.id));

    expect(read).toMatchObject({ entity: "Project" });
    expect(preview).toMatchObject({ entity: "Project" });
  }).pipe(withServices, withSchema),
);

const minute = 600_000_000n;
const { remindersEnabled, defaultReminderOffset, dateOnlyReminderTime } = SettingsCatalogue;

it.effect("Saving reminder defaults writes only changed values in one undo step", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const undo = yield* UndoService;
    const nine = Temporal.PlainTime.from("09:00");
    yield* settings.saveGlobal(true, 3n * day, day, undefined, undefined, {
      enabled: true,
      offset: hour,
      dateOnlyTime: nine,
    });
    expect(yield* globalRows).toEqual([]);

    yield* settings.saveGlobal(true, 3n * day, day, undefined, undefined, {
      enabled: false,
      offset: 15n * minute,
      dateOnlyTime: Temporal.PlainTime.from("10:00"),
    });

    expect(yield* globalRows).toEqual([
      { Key: "dateOnlyReminderTime", Value: "10:00:00" },
      { Key: "defaultReminderOffset", Value: "PT15M" },
      { Key: "remindersEnabled", Value: "false" },
    ]);
    expect((yield* undo.status()).undo).toBe("Edit global settings");
    yield* undo.apply("undo");
    expect(yield* globalRows).toEqual([]);
  }).pipe(withServices, withSchema),
);

it.effect("Saving other settings preserves an unlisted offset and a time with seconds", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const time = Temporal.PlainTime.from("09:00:17");
    yield* settings.setGlobal(defaultReminderOffset, 45n * minute);
    yield* settings.setGlobal(dateOnlyReminderTime, time);
    const loaded = yield* settings.loadGlobal();

    yield* settings.saveGlobal(false, 3n * day, day, undefined, undefined, {
      enabled: loaded.reminders.remindersEnabled.value,
      offset: loaded.reminders.defaultReminderOffset.value,
      dateOnlyTime: loaded.reminders.dateOnlyReminderTime.value,
    });

    expect(yield* settings.getGlobal(defaultReminderOffset)).toBe(45n * minute);
    expect((yield* settings.getGlobal(dateOnlyReminderTime)).toString()).toBe("09:00:17");
  }).pipe(withServices, withSchema),
);

it.effect(
  "Project reminder overrides save, report their source and reset to the global value",
  () =>
    Effect.gen(function* () {
      const settings = yield* SettingsService;
      const project = yield* (yield* ProjectService).create("Billing");
      yield* settings.setGlobal(defaultReminderOffset, 45n * minute);
      const overrides = {
        enabled: null,
        offset: 2n * day,
        dateOnlyTime: Temporal.PlainTime.from("10:00"),
      };

      yield* settings.saveProject(project.id, null, null, null, undefined, overrides);
      const overridden = yield* settings.loadProject(project.id);
      yield* settings.saveProject(project.id, null, null, null, undefined, {
        enabled: null,
        offset: null,
        dateOnlyTime: null,
      });
      const inherited = yield* settings.loadProject(project.id);

      expect(overridden.reminders.defaultReminderOffset).toEqual({
        value: 2n * day,
        source: "Project",
      });
      expect(overridden.reminders.dateOnlyReminderTime.source).toBe("Project");
      expect(overridden.reminders.remindersEnabled).toEqual({ value: true, source: "Global" });
      expect(inherited.reminders.defaultReminderOffset).toEqual({
        value: 45n * minute,
        source: "Global",
      });
      expect(inherited.reminders.dateOnlyReminderTime.value.toString()).toBe("09:00:00");
      const refused = yield* Effect.flip(
        settings
          .setGlobal(remindersEnabled, true)
          .pipe(Effect.andThen(settings.setGlobal(defaultReminderOffset, -minute))),
      );
      expect(refused.message).toBe("Reminder offsets must be nonnegative.");
    }).pipe(withServices, withSchema),
);

const { startWithSystem } = SettingsCatalogue;

/** Saves the default global values with only the start-with-system choice supplied. */
const saveDefaultsWithStartup = Effect.fnUntraced(function* (enabled: boolean | undefined) {
  const settings = yield* SettingsService;
  return yield* settings.saveGlobal(
    true,
    3n * day,
    day,
    undefined,
    undefined,
    undefined,
    undefined,
    enabled,
  );
});

it.effect("Saving global defaults persists start with system", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;

    yield* saveDefaultsWithStartup(true);

    expect(yield* settings.getGlobal(startWithSystem)).toBe(true);
    expect((yield* settings.loadGlobal()).startWithSystem).toBe(true);
  }).pipe(withServices, withSchema),
);

it.effect("Saving global defaults without start with system leaves it unchanged", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    yield* settings.setGlobal(startWithSystem, true);

    yield* saveDefaultsWithStartup(undefined);

    expect(yield* settings.getGlobal(startWithSystem)).toBe(true);
  }).pipe(withServices, withSchema),
);

it.effect("Start with system defaults to off and cannot be overridden per project", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const project = yield* (yield* ProjectService).create("Project");

    const initial = yield* settings.getGlobal(startWithSystem);
    const refused = yield* Effect.flip(
      settings.setProjectOverride(project.id, startWithSystem, true),
    );

    expect(initial).toBe(false);
    expect(refused.message).toBe("This setting cannot be overridden.");
    expect(yield* projectRows).toEqual([]);
  }).pipe(withServices, withSchema),
);

it.effect("A startup-only bulk save does not record an undo step", () =>
  Effect.gen(function* () {
    const undo = yield* UndoService;

    yield* saveDefaultsWithStartup(true);

    expect(yield* globalRows).toEqual([{ Key: "startWithSystem", Value: "true" }]);
    expect((yield* undo.status()).undo).toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Setting start with system on its own records no undo step", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const undo = yield* UndoService;

    yield* settings.setGlobal(startWithSystem, true);

    expect((yield* undo.status()).undo).toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Undoing a mixed global save keeps the start-with-system preference", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const undo = yield* UndoService;
    yield* settings.saveGlobal(
      false,
      3n * day,
      day,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    yield* undo.apply("undo");

    expect(yield* globalRows).toEqual([{ Key: "startWithSystem", Value: "true" }]);
    yield* undo.apply("redo");
    expect(yield* globalRows).toEqual([
      { Key: "autoCompleteParents", Value: "false" },
      { Key: "startWithSystem", Value: "true" },
    ]);
  }).pipe(withServices, withSchema),
);

it.effect("Loads the add view choices off by default and saves only the changed one", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const defaults = yield* settings.loadGlobal();

    yield* settings.saveGlobal(
      true,
      3n * day,
      day,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        todo: false,
        ticket: true,
      },
    );
    const saved = yield* settings.loadGlobal();

    expect(defaults.addOpensDetails).toEqual({ todo: false, ticket: false });
    expect(saved.addOpensDetails).toEqual({ todo: false, ticket: true });
    expect(yield* globalRows).toEqual([{ Key: "ticketAddOpensDetails", Value: "true" }]);
  }).pipe(withServices, withSchema),
);

it.effect("Loads no urgency colors by default and undoes a saved color", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    const undo = yield* UndoService;
    const defaults = yield* settings.loadGlobal();

    yield* settings.saveGlobal(
      true,
      3n * day,
      day,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { approaching: null, overdue: "#7B2FBE" },
    );
    const saved = yield* settings.loadGlobal();
    const rows = yield* globalRows;
    yield* undo.apply("undo");

    expect(defaults.urgencyColors).toEqual({ approaching: null, overdue: null });
    expect(saved.urgencyColors).toEqual({ approaching: null, overdue: "#7b2fbe" });
    expect(rows).toEqual([{ Key: "urgencyOverdueColor", Value: "#7b2fbe" }]);
    expect(yield* globalRows).toEqual([]);
    expect((yield* settings.loadGlobal()).urgencyColors.overdue).toBeNull();
  }).pipe(withServices, withSchema),
);

it.effect("Resetting an urgency color to the theme color stores empty text", () =>
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    yield* settings.setGlobal(SettingsCatalogue.urgencyApproachingColor, "#00aa88");

    yield* settings.saveGlobal(
      true,
      3n * day,
      day,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { approaching: null, overdue: null },
    );

    expect((yield* settings.loadGlobal()).urgencyColors.approaching).toBeNull();
    expect(yield* globalRows).toEqual([{ Key: "urgencyApproachingColor", Value: "" }]);
  }).pipe(withServices, withSchema),
);
