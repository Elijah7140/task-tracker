import type { UrgencyColors } from "@task-tracker/contracts";

type Colors = typeof UrgencyColors.Type;

/** The CSS custom properties that carry the chosen urgency colors (§6.3). */
export const URGENCY_COLOR_PROPERTIES = {
  approaching: "--tt-user-urgency-approaching",
  overdue: "--tt-user-urgency-overdue",
} as const satisfies Record<keyof Colors, string>;

/** The urgency colors of a server that sent none: the theme's own. */
export const THEME_URGENCY_COLORS: Colors = { approaching: null, overdue: null };

/**
 * Custom property values for chosen urgency colors. styles.css derives readable text and
 * soft tints from them on `:root` and on any element marked `data-urgency-colors`. A
 * theme color is `initial`, which hides an inherited choice so the theme token applies.
 */
export function urgencyColorStyle(colors: Colors): Record<string, string> {
  return {
    [URGENCY_COLOR_PROPERTIES.approaching]: colors.approaching ?? "initial",
    [URGENCY_COLOR_PROPERTIES.overdue]: colors.overdue ?? "initial",
  };
}
