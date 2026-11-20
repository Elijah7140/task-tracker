import { useLocation } from "@tanstack/react-router";
import { useReturnPageStore } from "../state/return-page-store.js";
import { useCurrentArea } from "../workspace/area-route.js";

/**
 * The page on show, as the menu bar's context-dependent commands see it (§8).
 * `covered` is any covering page, such as Search, whatever is behind it.
 */
export type MenuPage =
  | "home"
  | "workspace"
  | "app-settings"
  | "project-settings"
  | "covered"
  | "other";

/** Classifies a route path. Covering pages are not routes, so the caller checks them first. */
function routePage(pathname: string, projectId: string | undefined): MenuPage {
  if (pathname === "/") {
    return "home";
  }
  if (pathname === "/settings") {
    return "app-settings";
  }
  if (projectId === undefined) {
    return "other";
  }
  return pathname.endsWith("/settings") ? "project-settings" : "workspace";
}

/**
 * The page on show, the routed page (behind a covering page, if one is shown)
 * and the project it belongs to, for the menu bar.
 */
export function useMenuPage() {
  const { projectId } = useCurrentArea();
  const pathname = useLocation({ select: (location) => location.pathname });
  const covered = useReturnPageStore((state) => state.covering !== null);
  const routed = routePage(pathname, projectId);
  const page: MenuPage = covered ? "covered" : routed;
  return { page, routed, projectId };
}
