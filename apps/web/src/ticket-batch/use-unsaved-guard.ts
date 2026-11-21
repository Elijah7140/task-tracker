import { useEffect } from "react";

/**
 * Refuses to unload the page while it holds unsaved tickets. In the desktop window,
 * Electron main then asks the user whether to discard them (§7.20).
 */
export function useUnsavedGuard(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const refuse = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", refuse);
    return () => window.removeEventListener("beforeunload", refuse);
  }, [unsaved]);
}
