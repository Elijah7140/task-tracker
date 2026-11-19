import { type ReactNode, useEffect, useRef, useState } from "react";
import { CARD_GRID_SPACING, computeCardColumns } from "./card-grid-layout.js";

/** Props for {@link CardGrid}. */
export interface CardGridProps {
  readonly preferredColumns: number;
  /** Minimum height in CSS pixels for each row of open cards, or 0 for content-sized rows. */
  readonly minRowHeight?: number | undefined;
  /** The ID of the element that names this group of cards, such as its section heading. */
  readonly labelledBy?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Lays cards out in equal-width columns that shrink when the pane is narrower than
 * `preferredColumns` cards of 220 px. Every card in a row stretches to match the row's
 * tallest card, and open rows respect `minRowHeight` (§7.17).
 */
export function CardGrid({
  preferredColumns,
  minRowHeight = 0,
  labelledBy,
  children,
}: CardGridProps) {
  const ref = useRef<HTMLUListElement>(null);
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
  }, []);

  const columns = computeCardColumns(width, preferredColumns);
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
        gridAutoRows: minRowHeight > 0 ? `minmax(${minRowHeight}px, auto)` : "auto",
      }}
    >
      {children}
    </ul>
  );
}
