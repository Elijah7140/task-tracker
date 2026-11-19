import { PlugZap } from "lucide-react";
import { useAppliedTheme } from "../state/use-applied-theme.js";

/** Shown when the page opens without the launch's RPC connection details. */
export function ConnectionRequired() {
  useAppliedTheme();
  return (
    <main className="grid h-full place-items-center bg-canvas p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <PlugZap size={22} className="text-fg-muted" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Not connected</h1>
        <p className="text-fg-muted">
          Task Tracker opens this window with its local server’s connection details. Start the app
          from the desktop launcher.
        </p>
      </div>
    </main>
  );
}
