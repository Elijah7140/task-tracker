import { useAtomValue } from "@effect/atom-react";
import type { WorkspaceLayout } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { globalSettingsAtom } from "../rpc/settings-queries.js";

/** The workspace layout defaults (§6.5), used until the settings load or when a server sends none. */
export const DEFAULT_WORKSPACE_LAYOUT: typeof WorkspaceLayout.Type = {
  scaleCardColumnsToWindow: true,
  addLinePosition: "Top",
  detailsPanelPosition: "Side",
};

/** The saved workspace layout choices: card scaling, add line and details position (§7.17, §7.19). */
export function useWorkspaceLayout(): typeof WorkspaceLayout.Type {
  const settings = useAtomValue(globalSettingsAtom);
  return AsyncResult.isSuccess(settings)
    ? (settings.value.workspaceLayout ?? DEFAULT_WORKSPACE_LAYOUT)
    : DEFAULT_WORKSPACE_LAYOUT;
}
