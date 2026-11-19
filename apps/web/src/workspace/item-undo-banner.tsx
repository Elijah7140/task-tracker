import { useAtomValue } from "@effect/atom-react";
import { Clock, Duration, Effect, Exit } from "effect";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { rendererClockAtom } from "../rpc/urgency-refresh.js";
import { Button } from "../ui/button.js";
import type { DeletedItemNotice } from "./use-item-actions.js";

/** How long the post-delete undo notice remains visible on the Effect Clock. */
export const UNDO_BANNER_TIMEOUT = Duration.seconds(10);

/** Props for {@link ItemUndoBanner}. */
export interface ItemUndoBannerProps {
  readonly batch: DeletedItemNotice;
  readonly onUndo: () => Promise<void>;
  readonly onDismiss: () => void;
}

/**
 * Floating status bar offering one-click restore for the most recently deleted
 * item subtree. Auto-dismisses on the renderer's Effect Clock.
 */
export function ItemUndoBanner({ batch, onUndo, onDismiss }: ItemUndoBannerProps) {
  const clock = useAtomValue(rendererClockAtom);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const sleep =
      clock === undefined
        ? Effect.sleep(UNDO_BANNER_TIMEOUT)
        : Effect.sleep(UNDO_BANNER_TIMEOUT).pipe(Effect.provideService(Clock.Clock, clock));
    const interrupt = Effect.runCallback(sleep, {
      onExit: (exit) => {
        if (Exit.isSuccess(exit)) {
          onDismissRef.current();
        }
      },
    });
    return () => interrupt();
  }, [batch.batchId, clock]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="item-undo-banner"
      className="fixed right-6 bottom-6 z-40 flex items-center gap-3 rounded-card border border-line bg-raised py-2 pr-2 pl-3.5 text-sm text-fg shadow-raised"
    >
      <span className="max-w-72 truncate">Deleted &ldquo;{batch.title}&rdquo;</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void onUndo()}
        data-testid="item-undo-button"
        className="text-accent hover:text-accent-hover"
      >
        Undo
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss"
        onClick={onDismiss}
        data-testid="item-undo-dismiss"
      >
        <X size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
