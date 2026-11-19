import { Outlet } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { EditMenu } from "./edit-menu.js";
import { UndoBlockers } from "./undo-blockers.js";
import { useHistoryActions } from "./use-history-actions.js";
import { Sidebar } from "./sidebar.js";

/** The window layout: the navigation sidebar and the routed main pane. */
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
  return (
    <UndoBlockers.Provider value={register}>
      <div data-testid="app-shell" className="flex h-dvh bg-canvas text-fg">
        <Sidebar editMenu={<EditMenu {...history} />} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
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
    </UndoBlockers.Provider>
  );
}
