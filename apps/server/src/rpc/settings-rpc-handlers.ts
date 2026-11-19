import { SettingsRpcs } from "@task-tracker/contracts";
import { Effect, Layer } from "effect";
import { SettingsService } from "../services/settings-service.js";
import { mapOperationError } from "./map-operation-error.js";
import {
  parseGlobalSettings,
  parseProjectOverrides,
  projectEffectiveSettings,
  projectGlobalSettings,
} from "./settings-projection.js";

/** Bind settings reads, reconciliation previews and confirmed saves to the settings service. */
export const settingsRpcHandlers = SettingsRpcs.toLayer(
  Effect.gen(function* () {
    const settings = yield* SettingsService;
    return SettingsRpcs.of({
      LoadGlobalSettings: () =>
        settings.getGlobalSettings().pipe(Effect.map(projectGlobalSettings), mapOperationError),
      LoadProjectSettings: ({ projectId }) =>
        settings.getEffective(projectId).pipe(
          Effect.map((effective) => ({ projectId, ...projectEffectiveSettings(effective) })),
          mapOperationError,
        ),
      PreviewGlobalAutoComplete: () => settings.previewGlobalAutoComplete().pipe(mapOperationError),
      PreviewProjectAutoComplete: ({ projectId }) =>
        settings.previewProjectAutoComplete(projectId).pipe(mapOperationError),
      SaveGlobalSettings: ({ settings: values, approval }) =>
        Effect.suspend(() => settings.saveGlobal(...parseGlobalSettings(values), approval)).pipe(
          mapOperationError,
        ),
      SaveProjectSettings: ({ projectId, overrides, approval }) =>
        Effect.suspend(() =>
          settings.saveProject(projectId, ...parseProjectOverrides(overrides), approval),
        ).pipe(mapOperationError),
    });
  }),
).pipe(Layer.provide(SettingsService.layer));
