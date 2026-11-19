/** How close to a vertical edge, in pixels, a dragged pointer starts scrolling. */
export const EDGE_SCROLL_ZONE = 48;

/** The largest scroll step, in pixels, per auto-scroll tick at the very edge. */
export const EDGE_SCROLL_MAX_STEP = 16;

/** The vertical extent of a scroll viewport in client coordinates. */
export interface VerticalExtent {
  readonly top: number;
  readonly bottom: number;
}

/**
 * The scroll step for a dragged pointer at `clientY`: negative near the top
 * edge, positive near the bottom, larger closer to the edge, and zero
 * elsewhere or outside the viewport. A short viewport uses half its height as
 * the edge zone.
 */
export function edgeScrollStep(clientY: number, { top, bottom }: VerticalExtent): number {
  if (clientY < top || clientY > bottom) {
    return 0;
  }
  const zone = Math.min(EDGE_SCROLL_ZONE, (bottom - top) / 2);
  if (zone <= 0) {
    return 0;
  }
  const towardTop = Math.max(0, zone - (clientY - top));
  const towardBottom = Math.max(0, zone - (bottom - clientY));
  return (EDGE_SCROLL_MAX_STEP * (towardBottom - towardTop)) / zone;
}
