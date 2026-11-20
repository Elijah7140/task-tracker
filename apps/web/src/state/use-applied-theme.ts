import { useEffect, useSyncExternalStore } from "react";
import { resolveTheme, type ResolvedTheme } from "./theme-preference.js";
import { useThemeStore } from "./theme-store.js";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

/**
 * Resolves the theme preference and applies it as `data-theme` on `<html>`,
 * where the design tokens in styles.css read it.
 */
export function useAppliedTheme(): ResolvedTheme {
  const preference = useThemeStore((state) => state.preference);
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  return theme;
}
