import { Outlet } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { SearchPage } from "../search/search-page.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import { CalendarPage } from "../calendar/calendar-page.js";
import { TodayPage } from "../today/today-page.js";
import { TicketsPage } from "../tickets/tickets-page.js";
import { TrashPage } from "../trash/trash-page.js";
import { ReminderBell } from "../reminders/reminder-bell.js";
import { EditMenu } from "./edit-menu.js";
import { ReturnGuards, useReturnGuardRegistry } from "./return-guards.js";
import { UndoBlockers } from "./undo-blockers.js";
import { useCoveringPage } from "./use-covering-page.js";
import { useHistoryActions } from "./use-history-actions.js";
import { Sidebar } from "./sidebar.js";
import { StatusNotice } from "./status-notice.js";

/**
 * The undo and redo outcome toast. The live region stays mounted while empty, so
 * screen readers announce each new message (§7.8).
 */
function HistoryStatus({ message }: { readonly message: string | null }) {
  return (
    <div
      role="status"
      data-testid="history-status"
      className="pointer-events-none fixed bottom-6 left-[calc(50%+7.5rem)] z-40 max-w-[min(36rem,65vw)] -translate-x-1/2"
    >
      {message === null ? null : (
        <p className="rounded-card border border-line bg-raised px-4 py-2 text-sm text-fg shadow-raised">
          {message}
        </p>
      )}
    </div>
  );
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
  const { goBack } = useCoveringPage(returnGuards.run);
  const covering = useReturnPageStore((state) => state.covering);
  return (
    <UndoBlockers.Provider value={register}>
      <ReturnGuards.Provider value={returnGuards}>
        <div data-testid="app-shell" className="flex h-dvh bg-canvas text-fg">
          <Sidebar
            editMenu={
              <>
                <EditMenu {...history} />
                <ReminderBell runGuards={returnGuards.run} />
              </>
            }
          />
          <main className="min-w-0 flex-1 overflow-y-auto outline-none">
            <div className={covering === null ? "contents" : "hidden"}>
              <Outlet />
            </div>
            {covering === "trash" ? <TrashPage onBack={() => void goBack()} /> : null}
            {covering === "calendar" ? (
              <CalendarPage onBack={() => void goBack()} runGuards={returnGuards.run} />
            ) : null}
            {covering === "search" ? (
              <SearchPage onBack={() => void goBack()} runGuards={returnGuards.run} />
            ) : null}
            {covering === "today" ? (
              <TodayPage onBack={() => void goBack()} runGuards={returnGuards.run} />
            ) : null}
            {covering === "tickets" ? (
              <TicketsPage onBack={() => void goBack()} runGuards={returnGuards.run} />
            ) : null}
          </main>
          <StatusNotice superseded={history.message !== null} />
          <HistoryStatus message={history.message} />
        </div>
      </ReturnGuards.Provider>
    </UndoBlockers.Provider>
  );
}
