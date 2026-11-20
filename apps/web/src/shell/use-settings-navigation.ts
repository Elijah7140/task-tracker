import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { dialogStore } from "../state/dialog-store.js";
import { settleReturnPageWrites, useReturnPageStore } from "../state/return-page-store.js";
import { focusedElement, focusReturnTarget } from "./focus-return-target.js";
import { isInMenuBar } from "./menu-bar-focus.js";
import type { ReturnGuard } from "./return-guards.js";
import { useMenuPage } from "./use-menu-page.js";

/**
 * Leaves the covering page for a navigation that replaces the page behind it.
 * Waits for its changes, then asks every draft behind it, such as an item
 * editor, to resolve. False keeps the user where they are.
 */
async function leaveCoveringPage(runGuards: ReturnGuard): Promise<boolean> {
  await settleReturnPageWrites();
  if (useReturnPageStore.getState().busy || !(await runGuards())) {
    return false;
  }
  const state = useReturnPageStore.getState();
  if (state.busy) {
    return false;
  }
  state.uncover();
  return true;
}

/**
 * Puts focus on the page a menu command navigated to, when it was left on the
 * menu bar or fell to the body with the page it was on.
 */
function focusNewPage() {
  const active = focusedElement();
  if (active === null || isInMenuBar(active)) {
    focusReturnTarget(null);
  }
}

/**
 * Opens App Settings from the File menu (legacy `OpenSettingsFromMenuAsync`).
 * A covering page first gives way to the page behind it, whose drafts are
 * asked once. Leaving Project Settings asks its own unsaved-changes guard.
 * Back from App Settings returns to the project the user was in, if any.
 * Over App Settings itself, it acts as Back does.
 */
export function useOpenAppSettings(runGuards: ReturnGuard, goBack: () => Promise<void>) {
  const navigate = useNavigate();
  const { page, routed, projectId } = useMenuPage();
  const opening = useRef(false);
  return useCallback(async () => {
    if (opening.current || page === "app-settings" || dialogStore.getState().queue.length > 0) {
      return;
    }
    opening.current = true;
    try {
      if (page === "covered" && routed === "app-settings") {
        await goBack();
        return;
      }
      if (page === "covered" && !(await leaveCoveringPage(runGuards))) {
        return;
      }
      const search = projectId === undefined ? {} : { returnProjectId: projectId };
      await navigate({ to: "/settings", search });
      focusNewPage();
    } finally {
      opening.current = false;
    }
  }, [navigate, page, routed, projectId, runGuards, goBack]);
}

/** Opens Project Settings for the open workspace from the Project menu. */
export function useOpenProjectSettings() {
  const navigate = useNavigate();
  const { page, projectId } = useMenuPage();
  return useCallback(async () => {
    if (page !== "workspace" || projectId === undefined) {
      return;
    }
    await navigate({ to: "/projects/$projectId/settings", params: { projectId } });
    focusNewPage();
  }, [navigate, page, projectId]);
}
