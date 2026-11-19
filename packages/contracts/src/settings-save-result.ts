import { Schema } from "effect";
import { Guid } from "./guid.js";

/** The exact parent transitions the user approved. Send back the preview's IDs unchanged. */
export const ReconciliationApproval = Schema.Struct({
  parentIdsToComplete: Schema.Array(Guid),
  parentIdsToReopen: Schema.Array(Guid),
});

/** Parent transitions that enabling automatic completion would apply, with counts to display. */
export const SettingsReconciliationPreview = Schema.Struct({
  parentsToComplete: Schema.Int,
  parentsToReopen: Schema.Int,
  ...ReconciliationApproval.fields,
});

/**
 * A saved settings change, or the reconciliation to confirm before anything is saved.
 * To confirm, repeat the save with the preview as its approval. The server re-plans the
 * change and asks again if the affected parents differ from the approval.
 */
export const SettingsSaveResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("applied") }),
  Schema.Struct({
    kind: Schema.Literal("needs-confirmation"),
    preview: SettingsReconciliationPreview,
  }),
]);
