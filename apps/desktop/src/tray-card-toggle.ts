import { Clock, Duration, Effect } from "effect";

/** A click this soon after the card hid is the click that hid it (§7.18). */
export const TRAY_CARD_REOPEN_GUARD = Duration.millis(400);

/** The card window as the toggle sees it. */
export interface TrayCardSurface {
  readonly isVisible: () => boolean;
  readonly show: () => void;
  readonly hide: () => void;
}

/** Shows and hides the tray card in response to tray clicks, focus loss and Escape. */
export interface TrayCardToggle {
  /** Shows the card, or hides it when it is showing. */
  readonly click: Effect.Effect<void>;
  /** Hides the card, as clicking elsewhere or pressing Escape does. */
  readonly hide: Effect.Effect<void>;
}

/**
 * Clicking the tray icon while the card shows first takes focus from the card,
 * which hides it, and only then reports the click. Like the legacy popup, a
 * click within {@link TRAY_CARD_REOPEN_GUARD} of hiding, measured with Effect
 * Clock, therefore leaves the card hidden instead of showing it again.
 */
export function makeTrayCardToggle(card: TrayCardSurface): TrayCardToggle {
  let hiddenAt: number | undefined;

  const hide = Effect.flatMap(Clock.currentTimeMillis, (now) =>
    Effect.sync(() => {
      if (card.isVisible()) {
        hiddenAt = now;
        card.hide();
      }
    }),
  );

  const justHidden = (now: number) =>
    hiddenAt !== undefined && now - hiddenAt < Duration.toMillis(TRAY_CARD_REOPEN_GUARD);

  const click = Effect.flatMap(Clock.currentTimeMillis, (now) => {
    if (card.isVisible()) {
      return hide;
    }
    return justHidden(now) ? Effect.void : Effect.sync(card.show);
  });

  return { click, hide };
}
