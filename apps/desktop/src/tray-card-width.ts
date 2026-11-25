/** The card's width before its page reports one: a Full card (§7.18). */
export const DEFAULT_CARD_WIDTH = 400;

/** Widths the card window may take: a Compact card and a little more than a Full one. */
const MIN_CARD_WIDTH = 260;
const MAX_CARD_WIDTH = 480;

/**
 * The card window's content width for the width its page reports (§7.18): one
 * card wide, Full or Compact, rounded up and kept within fixed bounds. The
 * value crosses IPC from a renderer, so anything but a finite number is refused
 * with undefined.
 */
export function trayCardWidth(reported: unknown): number | undefined {
  if (typeof reported !== "number" || !Number.isFinite(reported)) {
    return undefined;
  }
  return Math.min(Math.max(Math.ceil(reported), MIN_CARD_WIDTH), MAX_CARD_WIDTH);
}
