import { useAtomRefresh } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { missingEntityMessage } from "../rpc/missing-entity.js";
import { projectWorkspaceAtom } from "../rpc/project-queries.js";
import { notify } from "../state/dialog-store.js";
import { areaTarget } from "./area-route.js";

/**
 * When an area fails to load because its folder was deleted elsewhere, reloads
 * the project's folders, opens the project root and shows the server's message,
 * instead of offering a retry that would keep failing. Returns whether that
 * fallback is under way.
 */
export function useMissingFolderFallback(
  result: AsyncResult.AsyncResult<unknown, RpcFailure>,
  projectId: string,
) {
  const navigate = useNavigate();
  const refreshWorkspace = useAtomRefresh(projectWorkspaceAtom(projectId));
  const message = AsyncResult.isFailure(result)
    ? missingEntityMessage(result.cause, "Folder")
    : undefined;

  useEffect(() => {
    if (message === undefined) {
      return;
    }
    refreshWorkspace();
    void navigate({ ...areaTarget(projectId, null), replace: true });
    void notify({ title: "Folder unavailable", message });
  }, [message, projectId, navigate, refreshWorkspace]);

  return message !== undefined;
}
