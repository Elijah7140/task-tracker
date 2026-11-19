import { useAtomValue } from "@effect/atom-react";
import { Clock, Duration, Effect, Exit } from "effect";
import { X } from "lucide-react";
import { useEffect } from "react";
import { rendererClockAtom } from "../rpc/urgency-refresh.js";
import { dismissStatusNotice, useStatusNoticeStore } from "../state/status-notice-store.js";
import { Button } from "../ui/button.js";

/** How long a status notice stays visible on the renderer's Effect Clock. */
export const STATUS_NOTICE_TIMEOUT = Duration.seconds(10);

/**
 * The app's transient status line, such as "That was the last repeat." (§7.11).
 * It announces politely and dismisses itself on the renderer clock, or when
 * `superseded` because the shell shows a newer message such as an undo result.
 */
export function StatusNotice({ superseded }: { readonly superseded: boolean }) {
  const notice = useStatusNoticeStore((state) => state.notice);
  const clock = useAtomValue(rendererClockAtom);
  useEffect(() => {
    if (superseded) {
      dismissStatusNotice();
    }
  }, [superseded]);
  useEffect(() => {
    if (notice === null) {
      return;
    }
    const sleep = Effect.sleep(STATUS_NOTICE_TIMEOUT);
    const timed =
      clock === undefined ? sleep : sleep.pipe(Effect.provideService(Clock.Clock, clock));
    return Effect.runCallback(timed, {
      onExit: (exit) => {
        if (Exit.isSuccess(exit) && useStatusNoticeStore.getState().notice?.id === notice.id) {
          dismissStatusNotice();
        }
      },
    });
  }, [notice, clock]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-[calc(50%+7.5rem)] z-40 -translate-x-1/2"
    >
      {notice === null ? null : (
        <div
          data-testid="status-notice"
          className="pointer-events-auto flex max-w-[min(36rem,65vw)] items-center gap-2 rounded-card border border-line bg-raised py-1.5 pr-1.5 pl-4 text-sm text-fg shadow-raised"
        >
          <span>{notice.message}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={dismissStatusNotice}
            data-testid="status-notice-dismiss"
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
