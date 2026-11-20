/** A screen rectangle in device-independent pixels, as Electron's `screen` reports it. */
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A point on screen in device-independent pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** The gap kept between the card and the cursor or the edge of the working area. */
export const TRAY_CARD_MARGIN = 12;

/** Clamps a coordinate inside `[lowest, highest]` less the margin, favouring the low edge. */
function clamp(value: number, lowest: number, highest: number) {
  const minimum = lowest + TRAY_CARD_MARGIN;
  const maximum = Math.max(minimum, highest - TRAY_CARD_MARGIN);
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Where the tray card's top-left corner goes (§7.18). It is centred just above
 * the cursor, which is over the tray icon, and kept inside the working area so a
 * taskbar on any edge stays uncovered. Without a cursor position the card goes
 * in the top-right corner, where Linux and macOS panels keep their tray.
 */
export function placeTrayCard(
  workArea: ScreenRect,
  card: { readonly width: number; readonly height: number },
  cursor: ScreenPoint | undefined,
): ScreenPoint {
  const preferred =
    cursor === undefined
      ? {
          x: workArea.x + workArea.width - card.width - TRAY_CARD_MARGIN,
          y: workArea.y + TRAY_CARD_MARGIN,
        }
      : { x: cursor.x - Math.floor(card.width / 2), y: cursor.y - card.height - TRAY_CARD_MARGIN };
  return {
    x: clamp(preferred.x, workArea.x, workArea.x + workArea.width - card.width),
    y: clamp(preferred.y, workArea.y, workArea.y + workArea.height - card.height),
  };
}
