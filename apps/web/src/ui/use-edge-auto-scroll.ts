import { useAtomValue } from "@effect/atom-react";
import { Clock, Duration, Effect, Fiber } from "effect";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { rendererClockAtom } from "../rpc/urgency-refresh.js";
import { edgeScrollStep } from "./edge-scroll.js";

/** How often a held drag near an edge scrolls, about once per display frame. */
export const EDGE_SCROLL_TICK = Duration.millis(16);

/** Rounds a step away from zero to whole pixels, so a slow scroll never stalls. */
function wholePixels(step: number): number {
  return step === 0 ? 0 : Math.sign(step) * Math.max(1, Math.round(Math.abs(step)));
}

/**
 * Scrolls `scrollRef` while a dragged pointer is held near its top or bottom
 * edge, faster nearer the edge (§7.16). Ticks sleep on the renderer's Effect
 * Clock, so tests step them with a `TestClock`. `onScrolled` runs after each
 * step, so the drop target can follow the rows under the pointer. Call
 * `update` on every pointer move and `stop` when the drag ends.
 */
export function useEdgeAutoScroll(
  scrollRef: RefObject<HTMLElement | null>,
  onScrolled: () => void,
) {
  const clock = useAtomValue(rendererClockAtom);
  const running = useRef<Fiber.Fiber<void> | null>(null);
  const pointerY = useRef(0);
  const latest = useRef(onScrolled);
  latest.current = onScrolled;

  const stepAt = useCallback(() => {
    const element = scrollRef.current;
    return element === null
      ? 0
      : wholePixels(edgeScrollStep(pointerY.current, element.getBoundingClientRect()));
  }, [scrollRef]);

  /** Scrolls one step. False once the pointer left the edge or the list cannot move further. */
  const scrollOnce = useCallback(() => {
    const element = scrollRef.current;
    const step = stepAt();
    if (element === null || step === 0) {
      return false;
    }
    const before = element.scrollTop;
    element.scrollTop = before + step;
    if (element.scrollTop === before) {
      return false;
    }
    latest.current();
    return true;
  }, [scrollRef, stepAt]);

  const stop = useCallback(() => {
    const fiber = running.current;
    running.current = null;
    if (fiber !== null) {
      Effect.runFork(Fiber.interrupt(fiber));
    }
  }, []);

  useEffect(() => stop, [stop]);

  const start = () => {
    const loop = Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep(EDGE_SCROLL_TICK);
        if (!scrollOnce()) {
          return;
        }
      }
    });
    const timed = clock === undefined ? loop : loop.pipe(Effect.provideService(Clock.Clock, clock));
    const forget = Effect.sync(() => {
      if (running.current === fiber) {
        running.current = null;
      }
    });
    const fiber: Fiber.Fiber<void> = Effect.runFork(timed.pipe(Effect.ensuring(forget)));
    running.current = fiber;
  };

  const update = (clientY: number) => {
    pointerY.current = clientY;
    if (stepAt() === 0) {
      stop();
    } else if (running.current === null) {
      start();
    }
  };

  return { update, stop };
}
