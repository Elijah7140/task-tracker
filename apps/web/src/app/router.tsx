import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { HomePage } from "../home/home-page.js";
import { AppSettingsPage } from "../settings/app-settings-page.js";
import { ProjectSettingsPage } from "../settings/project-settings-page.js";
import { AppShell } from "../shell/app-shell.js";
import { ProjectPage } from "../workspace/project-page.js";
import { NotFoundPage } from "./not-found-page.js";

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFoundPage });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });

/**
 * App Settings search params. `returnProjectId` is the project Back returns
 * to (the legacy `returnProjectId`); without it Back goes home.
 */
export interface AppSettingsSearch {
  readonly returnProjectId?: string;
}

function validateAppSettingsSearch(search: Record<string, unknown>): AppSettingsSearch {
  const returnProjectId = search["returnProjectId"];
  return typeof returnProjectId === "string" ? { returnProjectId } : {};
}

const appSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: AppSettingsPage,
  validateSearch: validateAppSettingsSearch,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectPage,
});

const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/settings",
  component: ProjectSettingsPage,
});

const folderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/folders/$folderId",
  component: ProjectPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  appSettingsRoute,
  projectRoute,
  projectSettingsRoute,
  folderRoute,
]);

/**
 * Creates the app router. The desktop build uses hash history because it
 * loads the renderer from a file. Tests use memory history.
 */
export function createAppRouter(history: RouterHistory) {
  return createRouter({ routeTree, history, scrollRestoration: true });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
