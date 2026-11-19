import { useAtomSet } from "@effect/atom-react";
import type { ProjectProjection } from "@task-tracker/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type Exit, Exit as ExitModule } from "effect";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import {
  createProjectAtom,
  deleteProjectAtom,
  PROJECTS_KEY,
  renameProjectAtom,
} from "../rpc/project-queries.js";
import { confirm, notify, prompt } from "../state/dialog-store.js";

/** The project fields the home and sidebar actions need. */
export type ProjectRef = Pick<typeof ProjectProjection.Type, "id" | "name">;

const reactivityKeys = [PROJECTS_KEY];

/** Shows a failed project action and reports whether it succeeded. */
async function reportFailure(exit: Exit.Exit<unknown, RpcFailure>): Promise<boolean> {
  if (ExitModule.isSuccess(exit)) {
    return true;
  }
  await notify({ title: "Project action failed", message: describeRpcFailure(exit.cause) });
  return false;
}

function useCreateProject() {
  const create = useAtomSet(createProjectAtom, { mode: "promiseExit" });
  return async () => {
    const name = await prompt({
      title: "New project",
      label: "Project name",
      confirmLabel: "Create",
    });
    if (name !== null) {
      await reportFailure(await create({ payload: { name }, reactivityKeys }));
    }
  };
}

function useRenameProject() {
  const rename = useAtomSet(renameProjectAtom, { mode: "promiseExit" });
  return async (project: ProjectRef) => {
    const name = await prompt({
      title: "Rename project",
      label: "Project name",
      initialValue: project.name,
      confirmLabel: "Rename",
    });
    if (name !== null) {
      await reportFailure(
        await rename({ payload: { projectId: project.id, name }, reactivityKeys }),
      );
    }
  };
}

function useDeleteProject() {
  const remove = useAtomSet(deleteProjectAtom, { mode: "promiseExit" });
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return async (project: ProjectRef) => {
    const confirmed = await confirm({
      title: "Delete project",
      message: `Delete ${project.name} and its contents?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    const deleted = await reportFailure(
      await remove({ payload: { projectId: project.id }, reactivityKeys }),
    );
    if (deleted && pathname.startsWith(`/projects/${project.id}`)) {
      await navigate({ to: "/" });
    }
  };
}

/**
 * Project create, rename and delete flows (the legacy HomeViewModel commands).
 * Each flow asks through the shared dialogs, sends one RPC and refreshes every
 * project query. A rejected action shows the server's message.
 */
export function useProjectActions() {
  return {
    createProject: useCreateProject(),
    renameProject: useRenameProject(),
    deleteProject: useDeleteProject(),
  };
}
