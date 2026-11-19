import { createContext, useContext, useLayoutEffect, useRef } from "react";

/** Resolves a page's unsaved changes. False keeps the user where they are. */
export type ReturnGuard = () => Promise<boolean>;

/**
 * Drafts mounted under the shell register an unsaved-changes guard. The shell
 * asks them once before returning from a covering page to an out-of-date page
 * (§7.6).
 */
export const ReturnGuards = createContext<((guard: ReturnGuard) => () => void) | null>(null);

/** Registers the latest `guard` for as long as the calling draft is mounted. */
export function useReturnGuard(guard: ReturnGuard) {
  const register = useContext(ReturnGuards);
  const latest = useRef(guard);
  latest.current = guard;
  useLayoutEffect(() => register?.(() => latest.current()), [register]);
}
