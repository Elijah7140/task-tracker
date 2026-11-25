import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { CARD_GRID_SPACING, type CardScreen, computeCardColumns } from "./card-grid-layout.js";
import { useWindowScreen, type WindowScreen } from "./use-window-screen.js";

/** Props for {@link CardGrid}. */
export interface CardGridProps {
  readonly preferredColumns: number;
  /** Whether Cards per row counts cards at full-screen width (§7.17). */
  readonly scaleToWindow?: boolean | undefined;
  /** The ID of the element that names this group of cards, such as its section heading. */
  readonly labelledBy?: string | undefined;
  readonly children: ReactNode;
}

/** Tracks the element's content width with a ResizeObserver. */
function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const update = () => setWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** The screen the grid scales to, where everything in the window but the grid is chrome. */
function cardScreen(windowScreen: WindowScreen | null, gridWidth: number): CardScreen | undefined {
  if (windowScreen === null || gridWidth <= 0) {
    return undefined;
  }
  return {
    screenWidth: windowScreen.screenWidth,
    chromeWidth: Math.max(0, windowScreen.windowWidth - gridWidth),
  };
}

/**
 * Lays cards out in equal-width columns (§7.17). With `scaleToWindow`, `preferredColumns` is
 * the count at full-screen width and narrower windows show fewer cards of about that width;
 * otherwise the grid shows `preferredColumns`. Columns never shrink below 220 px. Each row is
 * as tall as its tallest card's content, and the other cards in the row stretch to match.
 */
export function CardGrid({
  preferredColumns,
  scaleToWindow = false,
  labelledBy,
  children,
}: CardGridProps) {
  const ref = useRef<HTMLUListElement>(null);
  const width = useElementWidth(ref);
  const windowScreen = useWindowScreen(scaleToWindow);
  const columns = computeCardColumns(width, preferredColumns, {
    screen: cardScreen(windowScreen, width),
  });
  return (
    <ul
      ref={ref}
      role="group"
      aria-labelledby={labelledBy}
      data-testid="card-grid"
      data-columns={columns}
      className="grid list-none items-stretch p-0"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${CARD_GRID_SPACING}px`,
      }}
    >
      {children}
    </ul>
  );
}
