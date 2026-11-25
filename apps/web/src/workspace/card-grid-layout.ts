/** Minimum width of one card column in pixels before the grid steps down to fewer columns (§7.17). */
export const CARD_MIN_COLUMN_WIDTH = 220;

/** Gap between card columns and rows in pixels. */
export const CARD_GRID_SPACING = 12;

/** The most columns the Cards per row setting allows (§6.5). */
const MAX_COLUMNS = 8;

/** Absorbs sub-pixel rounding, so a pane exactly wide enough keeps its last column. */
const ROUNDING_ALLOWANCE = 1;

/**
 * The screen a window sits on, for Scale cards per row with window width (§7.17): the width a
 * maximized window fills, and how much of the window is not the grid (sidebar, padding and a
 * drilled-in item's details panel).
 */
export interface CardScreen {
  readonly screenWidth: number;
  readonly chromeWidth: number;
}

/** Options for {@link computeCardColumns}. */
export interface CardColumnOptions {
  /** Present when Cards per row counts cards at full-screen width; absent for a fixed count. */
  readonly screen?: CardScreen | undefined;
  readonly minColumnWidth?: number | undefined;
  readonly spacing?: number | undefined;
}

/** How many columns of `columnWidth` fit in `width`, with gaps between them. */
function fittingColumns(width: number, columnWidth: number, spacing: number) {
  return Math.floor((width + spacing + ROUNDING_ALLOWANCE) / (columnWidth + spacing));
}

/**
 * How many cards of about `cardWidth` the pane holds, rounded to the nearest count so cards
 * stay within a quarter of that width once two or more fit (§7.17).
 */
function nearestColumns(width: number, cardWidth: number, spacing: number) {
  return Math.round((width + spacing) / (cardWidth + spacing));
}

/**
 * The width one card has when `preferred` cards share the grid of a window that fills the
 * screen, or null when the screen is unknown.
 */
function fullScreenCardWidth(screen: CardScreen, preferred: number, spacing: number) {
  const gridWidth = screen.screenWidth - screen.chromeWidth;
  if (!Number.isFinite(gridWidth) || gridWidth <= 0) {
    return null;
  }
  return (gridWidth - (preferred - 1) * spacing) / preferred;
}

/**
 * Computes the number of columns the card grid uses at `containerWidth` for the Cards per row
 * setting `preferredColumns` (clamped 1–8, §7.17).
 *
 * Without `screen` the grid shows the preferred count. With `screen` the setting counts cards
 * at full-screen width: the grid shows as many cards of that width as fit, rounded to the
 * nearest count, so cards keep about the same width and fewer fit as the window narrows.
 * Either way a column is never narrower than `minColumnWidth`, the grid never shows more than
 * the preferred count, and there is always at least one column.
 */
export function computeCardColumns(
  containerWidth: number,
  preferredColumns: number,
  options: CardColumnOptions = {},
): number {
  const { screen, minColumnWidth = CARD_MIN_COLUMN_WIDTH, spacing = CARD_GRID_SPACING } = options;
  const preferred = Math.max(1, Math.min(MAX_COLUMNS, Math.trunc(preferredColumns)));
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return preferred;
  }
  const targetWidth = screen === undefined ? null : fullScreenCardWidth(screen, preferred, spacing);
  const scaled =
    targetWidth === null ? preferred : nearestColumns(containerWidth, targetWidth, spacing);
  const fitting = fittingColumns(containerWidth, minColumnWidth, spacing);
  return Math.max(1, Math.min(preferred, scaled, fitting));
}
