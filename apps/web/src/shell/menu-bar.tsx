import { Menubar } from "@base-ui/react/menubar";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { matchesShortcut } from "../ui/keyboard-shortcut.js";
import { EditMenu } from "./edit-menu.js";
import { FileMenu } from "./file-menu.js";
import { MENU_BAR_ATTRIBUTE, trackFocusOutsideMenuBar } from "./menu-bar-focus.js";
import { ProjectMenu } from "./project-menu.js";
import type { ReturnGuard } from "./return-guards.js";
import type { useHistoryActions } from "./use-history-actions.js";
import { leaveMenuBar, useMenuBarKeys } from "./use-menu-bar-keys.js";
import { useMenuPage } from "./use-menu-page.js";
import { useOpenAppSettings, useOpenProjectSettings } from "./use-settings-navigation.js";
import { ViewMenu } from "./view-menu.js";

/** Props for {@link MenuBar}. */
export interface MenuBarProps {
  readonly history: ReturnType<typeof useHistoryActions>;
  readonly runGuards: ReturnGuard;
  readonly goBack: () => Promise<void>;
}

/**
 * Escape on a menu's name, with no menu open, leaves the menu bar. It never
 * reaches a covering page behind, which would otherwise take it as Back.
 */
function leaveOnEscape(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target;
  const onClosedName =
    target instanceof HTMLElement &&
    event.currentTarget.contains(target) &&
    !target.hasAttribute("data-popup-open");
  if (onClosedName && matchesShortcut(event, { key: "Escape" })) {
    event.preventDefault();
    leaveMenuBar();
  }
}

/**
 * The window's menu bar (§8): File, Edit, Project and View. Commands that
 * depend on the page, such as import and export on Home or Project Settings
 * in a workspace, appear only there. Arrow keys move between and within the
 * menus; Alt, F10 and the access keys reach it from anywhere.
 */
export function MenuBar({ history, runGuards, goBack }: MenuBarProps) {
  const menuBarRef = useRef<HTMLDivElement>(null);
  const { page } = useMenuPage();
  const openAppSettings = useOpenAppSettings(runGuards, goBack);
  const openProjectSettings = useOpenProjectSettings();
  useMenuBarKeys(menuBarRef);
  useEffect(trackFocusOutsideMenuBar, []);
  return (
    <Menubar
      ref={menuBarRef}
      aria-label="Main menu"
      data-testid="main-menu"
      {...{ [MENU_BAR_ATTRIBUTE]: "" }}
      onKeyDown={leaveOnEscape}
      className="group/menubar flex items-center gap-0.5"
    >
      <FileMenu onHome={page === "home"} onOpenSettings={() => void openAppSettings()} />
      <EditMenu {...history} />
      <ProjectMenu page={page} onOpenProjectSettings={() => void openProjectSettings()} />
      <ViewMenu />
    </Menubar>
  );
}
