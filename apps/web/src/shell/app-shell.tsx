import { Outlet } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { useReturnPageStore } from "../state/return-page-store.js";
import { CalendarPage } from "../calendar/calendar-page.js";
import { TrashPage } from "../trash/trash-page.js";
import { EditMenu } from "./edit-menu.js";
import { type ReturnGuard, ReturnGuards } from "./return-guards.js";
import { UndoBlockers } from "./undo-blockers.js";
import { useCoveringPage } from "./use-covering-page.js";
import { useHistoryActions } from "./use-history-actions.js";
import { Sidebar } from "./sidebar.js";

/** Drafts register unsaved-changes guards. The shell asks them in turn before returning. */
function useReturnGuardRegistry() {
  const guards = useRef(new Set<ReturnGuard>());
  const register = useCallback((guard: ReturnGuard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);
  const runGuards = useCallback(async () => {
    for (const guard of guards.current) {
      if (!(await guard())) {
        return false;
      }
    }
    return true;
  }, []);
  return { register, runGuards };
}

/**
 * The window layout: the navigation sidebar and the routed main pane. A
 * covering page such as Trash replaces the routed page on screen while
 * keeping it mounted, so its state and drafts survive the visit.
 */
export function AppShell() {
  const blockers = useRef(new Set<() => string | null>());
  const register = useCallback((read: () => string | null) => {
    blockers.current.add(read);
    return () => {
      blockers.current.delete(read);
    };
  }, []);
  const history = useHistoryActions(
    () =>
      [...blockers.current].map((read) => read()).find((reason) => reason !== null) ?? undefined,
  );
  const returnGuards = useReturnGuardRegistry();
  const { goBack } = useCoveringPage(returnGuards.runGuards);
  const covering = useReturnPageStore((state) => state.covering);
  return (
    <UndoBlockers.Provider value={register}>
      <ReturnGuards.Provider value={returnGuards.register}>
        <div data-testid="app-shell" className="flex h-dvh bg-canvas text-fg">
          <Sidebar editMenu={<EditMenu {...history} />} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className={covering === null ? "contents" : "hidden"}>
              <Outlet />
            </div>
            {covering === "trash" ? <TrashPage onBack={() => void goBack()} /> : null}
            {covering === "calendar" ? (
              <CalendarPage onBack={() => void goBack()} runGuards={returnGuards.runGuards} />
            ) : null}
          </main>
          {history.message === null ? null : (
            <div
              role="status"
              data-testid="history-status"
              className="pointer-events-none fixed bottom-6 left-[calc(50%+7.5rem)] z-40 max-w-[min(36rem,65vw)] -translate-x-1/2 rounded-card border border-line bg-raised px-4 py-2 text-sm text-fg shadow-raised"
            >
              {history.message}
            </div>
          )}
        </div>
      </ReturnGuards.Provider>
    </UndoBlockers.Provider>
  );
}
