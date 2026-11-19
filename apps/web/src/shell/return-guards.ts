import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";

/** Resolves a page's unsaved changes. False keeps the user where they are. */
export type ReturnGuard = () => Promise<boolean>;

/** The shell's one registry of unsaved-changes guards. */
export interface ReturnGuardRegistry {
  /** Adds a guard and returns the function that removes it. */
  readonly register: (guard: ReturnGuard) => () => void;
  /** Asks every registered guard in turn. False as soon as one keeps the user where they are. */
  readonly run: ReturnGuard;
}

/**
 * Drafts mounted under the shell register an unsaved-changes guard: the item
 * editor and the App and Project Settings forms. The shell asks them once
 * before returning from a covering page to an out-of-date page or opening a
 * result from one (§7.6, §7.8), and item moves ask them before saving (§7.5).
 */
export const ReturnGuards = createContext<ReturnGuardRegistry | null>(null);

const resolveNothing: ReturnGuard = () => Promise.resolve(true);

/** Creates the shell's registry. Guards are asked in the order they registered. */
export function useReturnGuardRegistry(): ReturnGuardRegistry {
  const guards = useRef(new Set<ReturnGuard>());
  const register = useCallback((guard: ReturnGuard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);
  const run = useCallback(async () => {
    for (const guard of guards.current) {
      if (!(await guard())) {
        return false;
      }
    }
    return true;
  }, []);
  return useMemo(() => ({ register, run }), [register, run]);
}

/** Registers the latest `guard` for as long as the calling draft is mounted. */
export function useReturnGuard(guard: ReturnGuard) {
  const register = useContext(ReturnGuards)?.register;
  const latest = useRef(guard);
  latest.current = guard;
  useLayoutEffect(() => register?.(() => latest.current()), [register]);
}

/** Asks every mounted draft to resolve its unsaved changes. Resolves true without a shell. */
export function useRunReturnGuards(): ReturnGuard {
  return useContext(ReturnGuards)?.run ?? resolveNothing;
}
