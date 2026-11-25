import { SettingsRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { SettingsService } from "../services/settings-service.js";
import { mapOperationError } from "./map-operation-error.js";
import {
  parseGlobalSettings,
  parseProjectOverrides,
  parseReminderDefaults,
  parseReminderOverrides,
  projectGlobalSettings,
  projectOverridableSettings,
  projectReminderDefaults,
  projectReminderSettings,
} from "./settings-projection.js";

/** Bind settings reads, reconciliation previews and confirmed saves to the settings service. */
export const settingsRpcHandlers = SettingsRpcs.toLayer(
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    return SettingsRpcs.of({
      LoadGlobalSettings: () =>
        settings.loadGlobal().pipe(
          Effect.map(
            ({
              settings: values,
              reminders,
              keepRunningInTray,
              startWithSystem,
              addOpensDetails,
              autoHideCompleted,
              urgencyColors,
              trayCard,
              showTicketDetailOnCards,
            }) => ({
              ...projectGlobalSettings(values),
              reminders: projectReminderDefaults(reminders),
              keepRunningInTray,
              startWithSystem,
              addOpensDetails,
              autoHideCompleted,
              urgencyColors,
              trayCard,
              showTicketDetailOnCards,
            }),
          ),
          mapOperationError,
        ),
      LoadProjectSettings: ({ projectId }) =>
        settings.loadProject(projectId).pipe(
          Effect.map(({ settings: effective, reminders }) => ({
            projectId,
            ...projectOverridableSettings(effective),
            reminders: projectReminderSettings(reminders),
          })),
          mapOperationError,
        ),
      PreviewGlobalAutoComplete: () => settings.previewGlobalAutoComplete().pipe(mapOperationError),
      PreviewProjectAutoComplete: ({ projectId }) =>
        settings.previewProjectAutoComplete(projectId).pipe(mapOperationError),
      SaveGlobalSettings: ({ settings: values, approval }) =>
        Effect.suspend(() =>
          settings.saveGlobal(
            ...parseGlobalSettings(values),
            approval,
            values.workspaceCardColumns,
            parseReminderDefaults(values.reminders),
            values.keepRunningInTray,
            values.startWithSystem,
            values.addOpensDetails,
            values.urgencyColors,
            values.autoHideCompleted,
            values.trayCard,
            values.showTicketDetailOnCards,
          ),
        ).pipe(mapOperationError),
      SaveProjectSettings: ({ projectId, overrides, approval }) =>
        Effect.suspend(() =>
          settings.saveProject(
            projectId,
            ...parseProjectOverrides(overrides),
            approval,
            parseReminderOverrides(overrides.reminders),
          ),
        ).pipe(mapOperationError),
    });
  }),
).pipe(Layer.provide(SettingsService.layer));
