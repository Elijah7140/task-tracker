import { type RefObject, useEffect } from "react";

/** The card's frame, its scrolling body and the content inside that body. */
export interface CardSizeRefs {
  readonly frame: RefObject<HTMLElement | null>;
  readonly body: RefObject<HTMLElement | null>;
  readonly content: RefObject<HTMLElement | null>;
}

/**
 * The height the card needs to show everything: the frame without its scrolling body,
 * plus the body's whole content. It stays right while main has capped the window and the
 * body scrolls.
 */
function neededHeight({ frame, body, content }: CardSizeRefs) {
  const frameHeight = frame.current?.getBoundingClientRect().height ?? 0;
  const bodyHeight = body.current?.getBoundingClientRect().height ?? 0;
  const contentHeight = content.current?.getBoundingClientRect().height ?? 0;
  return Math.ceil(frameHeight - bodyHeight + contentHeight);
}

/**
 * Reports the card's width and the height it needs to Electron main whenever either
 * changes, so the borderless card window fits the card up to the working area's height,
 * after which the card scrolls (§7.18). Outside Electron nothing listens.
 */
export function useReportCardSize(refs: CardSizeRefs) {
  useEffect(() => {
    const report = window.taskTrackerDesktop?.reportTrayCardSize;
    const frame = refs.frame.current;
    if (report === undefined || frame === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      report(Math.ceil(frame.getBoundingClientRect().width), neededHeight(refs));
    });
    for (const element of [refs.frame.current, refs.body.current, refs.content.current]) {
      if (element !== null) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [refs]);
}
