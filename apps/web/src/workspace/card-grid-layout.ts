/** Minimum width of one card column in pixels before the grid steps down to fewer columns (§7.17). */
export const CARD_MIN_COLUMN_WIDTH = 220;

/** Gap between card columns and rows in pixels. */
export const CARD_GRID_SPACING = 12;

/** Room reserved for a priority section header above its cards. */
const SECTION_HEADER_ALLOWANCE = 40;

/** Target number of open card rows visible in the item viewport at once (§7.17). */
const VISIBLE_CARD_ROWS = 2;

/**
 * Computes the number of columns actually used at `containerWidth` given the global
 * `preferredColumns` setting (clamped 1–8). When the pane is too narrow for that many
 * cards at `minColumnWidth`, returns the largest count that fits (at least 1).
 */
export function computeCardColumns(
  containerWidth: number,
  preferredColumns: number,
  minColumnWidth = CARD_MIN_COLUMN_WIDTH,
  spacing = CARD_GRID_SPACING,
): number {
  const preferred = Math.max(1, Math.min(8, Math.trunc(preferredColumns)));
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return preferred;
  }
  const fitting = Math.floor((containerWidth + spacing) / (minColumnWidth + spacing));
  return Math.max(1, Math.min(preferred, fitting));
}

/**
 * Minimum height for an open card row so about two rows fill the item pane height
 * (less room for a section header and row spacing, §7.17).
 */
export function computeCardMinHeight(viewportHeight: number): number {
  const cardsHeight = viewportHeight - SECTION_HEADER_ALLOWANCE;
  return Math.max(0, Math.floor(cardsHeight / VISIBLE_CARD_ROWS - CARD_GRID_SPACING));
}
