import type {
  ReconciliationApproval,
  SettingsReconciliationPreview,
  SettingsSaveResult,
} from "@task-tracker/contracts";
import { type Cause, Exit } from "effect";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { confirm } from "../state/dialog-store.js";

type Preview = typeof SettingsReconciliationPreview.Type;
type Approval = typeof ReconciliationApproval.Type;
type SaveResult = typeof SettingsSaveResult.Type;

/** Outcome of running {@link confirmSettingsSave}. */
export type ConfirmedSaveOutcome =
  | { readonly kind: "applied" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly cause: Cause.Cause<RpcFailure> };

/** Options for {@link confirmSettingsSave}. */
export interface ConfirmSettingsSaveOptions {
  readonly turnsAutoCompleteOn: boolean;
  readonly preview: () => Promise<Exit.Exit<Preview, RpcFailure>>;
  readonly save: (approval?: Approval) => Promise<Exit.Exit<SaveResult, RpcFailure>>;
}

function toApproval(preview: Preview): Approval {
  return {
    parentIdsToComplete: preview.parentIdsToComplete,
    parentIdsToReopen: preview.parentIdsToReopen,
  };
}

function promptMessage(preview: Preview, stale: boolean): string {
  const base = `Turning this on will complete ${preview.parentsToComplete} parents and reopen ${preview.parentsToReopen} parents. Continue?`;
  return stale ? `Affected items changed. ${base}` : base;
}

async function promptReconciliation(preview: Preview, stale: boolean): Promise<boolean> {
  return confirm({
    title: "Turn on auto-complete",
    message: promptMessage(preview, stale),
    confirmLabel: "Continue",
  });
}

/**
 * Runs a settings save with auto-complete reconciliation confirmation. Previews
 * when auto-complete is turning on and re-prompts if affected parents change
 * before the transactional save commits.
 */
export async function confirmSettingsSave({
  turnsAutoCompleteOn,
  preview,
  save,
}: ConfirmSettingsSaveOptions): Promise<ConfirmedSaveOutcome> {
  let approval: Approval | undefined;
  let prompted = false;

  if (turnsAutoCompleteOn) {
    const previewExit = await preview();
    if (Exit.isFailure(previewExit)) {
      return { kind: "failed", cause: previewExit.cause };
    }
    const previewData = previewExit.value;
    if (previewData.parentsToComplete + previewData.parentsToReopen > 0) {
      if (!(await promptReconciliation(previewData, false))) {
        return { kind: "cancelled" };
      }
      prompted = true;
      approval = toApproval(previewData);
    }
  }

  for (;;) {
    const saveExit = await save(approval);
    if (Exit.isFailure(saveExit)) {
      return { kind: "failed", cause: saveExit.cause };
    }
    if (saveExit.value.kind === "applied") {
      return { kind: "applied" };
    }
    const fresh = saveExit.value.preview;
    if (!(await promptReconciliation(fresh, prompted))) {
      return { kind: "cancelled" };
    }
    prompted = true;
    approval = toApproval(fresh);
  }
}
