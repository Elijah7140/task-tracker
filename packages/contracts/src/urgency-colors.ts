import { Schema } from "effect";

/** A color in `#rrggbb` form. */
export const HexColor = Schema.String.check(Schema.isPattern(/^#[0-9A-Fa-f]{6}$/));

/**
 * The chosen urgency colors (§6.3, §6.5). Null keeps the theme's color for that level.
 * Imminent and Overdue share one color, as they share the theme's red.
 */
export const UrgencyColors = Schema.Struct({
  approaching: Schema.NullOr(HexColor),
  overdue: Schema.NullOr(HexColor),
});
