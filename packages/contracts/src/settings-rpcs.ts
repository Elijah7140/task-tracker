import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Guid } from "./guid.js";
import { RpcOperationError } from "./rpc-operation-error.js";
import { GlobalSettings, ProjectSettingOverrides, ProjectSettings } from "./settings.js";
import {
  ReconciliationApproval,
  SettingsReconciliationPreview,
  SettingsSaveResult,
} from "./settings-save-result.js";

const approval = Schema.optionalKey(ReconciliationApproval);

/** Read and save global defaults and project overrides, confirming completion reconciliation. */
export const SettingsRpcs = RpcGroup.make(
  Rpc.make("LoadGlobalSettings", { success: GlobalSettings, error: RpcOperationError }),
  Rpc.make("LoadProjectSettings", {
    payload: { projectId: Guid },
    success: ProjectSettings,
    error: RpcOperationError,
  }),
  Rpc.make("PreviewGlobalAutoComplete", {
    success: SettingsReconciliationPreview,
    error: RpcOperationError,
  }),
  Rpc.make("PreviewProjectAutoComplete", {
    payload: { projectId: Guid },
    success: SettingsReconciliationPreview,
    error: RpcOperationError,
  }),
  Rpc.make("SaveGlobalSettings", {
    payload: { settings: GlobalSettings, approval },
    success: SettingsSaveResult,
    error: RpcOperationError,
  }),
  Rpc.make("SaveProjectSettings", {
    payload: { projectId: Guid, overrides: ProjectSettingOverrides, approval },
    success: SettingsSaveResult,
    error: RpcOperationError,
  }),
);
