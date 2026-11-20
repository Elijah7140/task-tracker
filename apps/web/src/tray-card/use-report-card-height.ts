import { type RefObject, useEffect } from "react";

/**
 * Reports the card's drawn height to Electron main whenever it changes, so the
 * borderless card window fits the card (§7.18). Outside Electron nothing listens.
 */
export function useReportCardHeight(card: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const report = window.taskTrackerDesktop?.reportTrayCardHeight;
    const element = card.current;
    if (report === undefined || element === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      report(Math.ceil(element.getBoundingClientRect().height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [card]);
}
