import type { CompletionResult } from "@task-tracker/contracts";
import { Exit } from "effect";
import { confirm } from "../state/dialog-store.js";

/** Reissues completion with the exact open descendants approved by the user. */
export async function requestCompletion<Failure>(
  invoke: (
    approval?: readonly string[],
  ) => Promise<Exit.Exit<typeof CompletionResult.Type, Failure>>,
) {
  let approval: readonly string[] | undefined;
  for (;;) {
    const exit = await invoke(approval);
    if (Exit.isFailure(exit) || exit.value.kind !== "needs-confirmation") {
      return exit;
    }
    const { openSubItemCount, openSubItemIds } = exit.value;
    const noun = openSubItemCount === 1 ? "sub-item" : "sub-items";
    const question = `Also complete ${openSubItemCount} open ${noun}?`;
    const approved = await confirm({
      title: "Complete sub-items",
      message: approval === undefined ? question : `Open sub-items changed. ${question}`,
      confirmLabel: "Complete",
    });
    if (!approved) {
      return undefined;
    }
    approval = openSubItemIds;
  }
}
