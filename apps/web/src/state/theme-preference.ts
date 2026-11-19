/** The user's appearance choice. `system` follows the OS light or dark setting. */
export type ThemePreference = "system" | "light" | "dark";

/** The theme applied to the page. */
export type ResolvedTheme = "light" | "dark";

/** Every supported preference, in the order the theme switcher shows them. */
export const THEME_PREFERENCES: ReadonlyArray<ThemePreference> = ["light", "dark", "system"];

/** Narrows an untrusted value, such as a stored preference. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Picks the page theme from the preference and the OS appearance. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}
