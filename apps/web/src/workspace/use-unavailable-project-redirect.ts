import { useAtomRefresh } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { Cause, Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { projectSummariesAtom } from "../rpc/project-queries.js";
import { notify } from "../state/dialog-store.js";

/**
 * Returns home and explains why when the server rejects a project, for example
 * one deleted since the link was shown. The project list is reloaded so the
 * stale entry disappears. Transport failures stay on the page.
 */
export function useUnavailableProjectRedirect(
  result: AsyncResult.AsyncResult<unknown, RpcFailure>,
) {
  const navigate = useNavigate();
  const refreshProjects = useAtomRefresh(projectSummariesAtom);
  const rejection = AsyncResult.isFailure(result) ? ruleViolation(result.cause) : undefined;

  useEffect(() => {
    if (rejection === undefined) {
      return;
    }
    refreshProjects();
    void navigate({ to: "/" });
    void notify({ title: "Project unavailable", message: rejection });
  }, [rejection, navigate, refreshProjects]);

  return rejection !== undefined;
}

function ruleViolation(cause: Cause.Cause<RpcFailure>) {
  const error = Cause.findErrorOption(cause);
  return Option.isSome(error) && error.value._tag === "RuleViolation"
    ? describeRpcFailure(cause)
    : undefined;
}
