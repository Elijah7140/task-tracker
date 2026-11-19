import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./sidebar.js";

/** The window layout: the navigation sidebar and the routed main pane. */
export function AppShell() {
  return (
    <div data-testid="app-shell" className="flex h-dvh bg-canvas text-fg">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
