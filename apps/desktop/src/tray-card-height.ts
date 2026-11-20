/** Heights the card window may take, whatever the card's page reports. */
const MIN_CARD_HEIGHT = 80;
const MAX_CARD_HEIGHT = 640;

/**
 * The card window's content height for the height its page reports (§7.18),
 * rounded up and kept within fixed bounds. The value crosses IPC from a
 * renderer, so anything but a finite number is refused with undefined.
 */
export function trayCardHeight(reported: unknown): number | undefined {
  if (typeof reported !== "number" || !Number.isFinite(reported)) {
    return undefined;
  }
  return Math.min(Math.max(Math.ceil(reported), MIN_CARD_HEIGHT), MAX_CARD_HEIGHT);
}
