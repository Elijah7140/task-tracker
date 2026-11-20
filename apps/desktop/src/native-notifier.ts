import type { DesktopNotification } from "@task-tracker/contracts";
import { Clock, Duration, Effect } from "effect";

type Notification = typeof DesktopNotification.Type;

/** How long native delivery pauses after a platform failure (§7.12). */
export const NATIVE_RETRY_DELAY = Duration.minutes(5);

/** Shows one notification on the platform, throwing when the platform refuses it. */
export type ShowNotification = (notification: Notification) => void;

/** A native notifier that leaves the in-app panel to carry reminders while it cools down. */
export interface NativeNotifier {
  /** Shows the notification unless native delivery is cooling down. */
  readonly notify: (notification: Notification) => Effect.Effect<void>;
  /** Pauses native delivery, as after an asynchronous platform failure. */
  readonly reportFailure: (error: unknown) => Effect.Effect<void>;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Adapts the platform call. After a failure it logs once, skips native
 * notifications for {@link NATIVE_RETRY_DELAY} measured with Effect Clock, then
 * tries again. A success resets the log, so a later outage is reported again.
 */
export function makeNativeNotifier(
  show: ShowNotification,
  log: (message: string) => void,
): NativeNotifier {
  let retryAfter: number | undefined;
  let failureLogged = false;

  const reportFailure = (error: unknown) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      Effect.sync(() => {
        retryAfter = now + Duration.toMillis(NATIVE_RETRY_DELAY);
        if (!failureLogged) {
          failureLogged = true;
          log(`Native reminders unavailable; retrying in 5 minutes: ${describe(error)}`);
        }
      }),
    );

  const deliver = (notification: Notification) =>
    Effect.try({ try: () => show(notification), catch: (error) => error }).pipe(
      Effect.andThen(
        Effect.sync(() => {
          retryAfter = undefined;
          failureLogged = false;
        }),
      ),
      Effect.catch(reportFailure),
    );

  const notify = (notification: Notification) =>
    Effect.flatMap(Clock.currentTimeMillis, (now) =>
      retryAfter !== undefined && now < retryAfter ? Effect.void : deliver(notification),
    );

  return { notify, reportFailure };
}
