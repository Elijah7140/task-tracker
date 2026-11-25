/** The smallest height the card window takes, whatever the card's page reports. */
const MIN_CARD_HEIGHT = 80;

/**
 * The card window's content height for the height its page reports (§7.18),
 * rounded up and kept between a small minimum and `maximum`, the height the
 * screen's working area leaves. A taller card scrolls inside the window. The
 * value crosses IPC from a renderer, so anything but a finite number is refused
 * with undefined.
 */
export function trayCardHeight(reported: unknown, maximum: number): number | undefined {
  if (typeof reported !== "number" || !Number.isFinite(reported)) {
    return undefined;
  }
  const highest = Math.max(MIN_CARD_HEIGHT, Math.floor(maximum));
  return Math.min(Math.max(Math.ceil(reported), MIN_CARD_HEIGHT), highest);
}
