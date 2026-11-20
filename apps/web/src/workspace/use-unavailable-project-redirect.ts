import { useAtomRefresh } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { missingEntityMessage } from "../rpc/missing-entity.js";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { notify } from "../state/dialog-store.js";

/**
 * Returns home and reloads the project list when a project is missing or
 * deleted, then shows the server's message. `beforeRedirect` runs first, so a
 * settings page can drop its unsaved-changes guard: there is nothing left to
 * save. Returns whether the redirect is under way.
 */
export function useUnavailableProjectRedirect(
  result: AsyncResult.AsyncResult<unknown, RpcFailure>,
  beforeRedirect?: () => void,
) {
  const navigate = useNavigate();
  const refreshProjects = useAtomRefresh(projectSummariesAtom);
  const rejection = AsyncResult.isFailure(result)
    ? missingEntityMessage(result.cause, "Project")
    : undefined;

  useEffect(() => {
    if (rejection === undefined) {
      return;
    }
    beforeRedirect?.();
    refreshProjects();
    void navigate({ to: "/" });
    void notify({ title: "Project unavailable", message: rejection });
  }, [rejection, beforeRedirect, navigate, refreshProjects]);

  return rejection !== undefined;
}
