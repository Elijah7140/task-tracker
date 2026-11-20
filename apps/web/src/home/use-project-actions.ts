import { useAtomSet } from "@effect/atom-react";
import type { ProjectProjection } from "@task-tracker/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Exit } from "effect";
import { NAME_VALIDATION } from "../dialogs/name-validation.js";
import { reportFailure } from "../dialogs/report-failure.js";
import type { RpcFailure } from "../rpc/describe-rpc-failure.js";
import { HISTORY_KEY } from "../rpc/history-queries.js";
import {
  createProjectAtom,
  deleteProjectAtom,
  PROJECTS_KEY,
  renameProjectAtom,
} from "../rpc/project-queries.js";
import { confirm, prompt } from "../state/dialog-store.js";

/** The project fields the home and sidebar actions need. */
export type ProjectRef = Pick<typeof ProjectProjection.Type, "id" | "name">;

const reactivityKeys = [PROJECTS_KEY, HISTORY_KEY];

/** Shows a failed project action and reports whether it succeeded. */
const reportProjectFailure = (exit: Exit.Exit<unknown, RpcFailure>) =>
  reportFailure("Project action failed", exit);

function useCreateProject() {
  const create = useAtomSet(createProjectAtom, { mode: "promiseExit" });
  return async () => {
    const name = await prompt({
      title: "New project",
      label: "Project name",
      confirmLabel: "Create",
      validation: NAME_VALIDATION,
    });
    if (name !== null) {
      await reportProjectFailure(await create({ payload: { name }, reactivityKeys }));
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
      validation: NAME_VALIDATION,
    });
    if (name !== null) {
      await reportProjectFailure(
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
    const deleted = await reportProjectFailure(
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
