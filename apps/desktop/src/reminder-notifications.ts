import type { DesktopNotification } from "@task-tracker/contracts";
import type { ShowNotification } from "./native-notifier.js";

const MAX_TITLE_LENGTH = 256;
const MAX_BODY_LENGTH = 1_024;

/** How many shown notifications stay referenced for a later click. */
export const MAX_RETAINED_NOTIFICATIONS = 50;

/** The parts of a shown Electron notification the reminders use. */
export interface PlatformNotification {
  on(event: "click", listener: () => void): unknown;
  on(event: "failed", listener: (event: unknown, error: string) => void): unknown;
  show(): void;
}

/** Electron's `Notification` class, passed in by Electron main. */
export interface NotificationPlatform {
  isSupported(): boolean;
  new (options: { title: string; body: string; icon: string }): PlatformNotification;
}

/** Where clicked notifications and asynchronous platform failures go. */
export interface ReminderNotificationOptions {
  readonly iconPath: string;
  /** Brings the window forward and opens the item, or the panel when null. */
  readonly onActivate: (itemId: string | null) => void;
  readonly onFailure: (error: unknown) => void;
  readonly platform: NotificationPlatform;
}

const truncate = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

/** Keeps a shown notification referenced, dropping the oldest beyond the cap. */
function retain(shown: Set<PlatformNotification>, notification: PlatformNotification) {
  shown.add(notification);
  const oldest = shown.values().next().value;
  if (shown.size > MAX_RETAINED_NOTIFICATIONS && oldest !== undefined) {
    shown.delete(oldest);
  }
}

/**
 * Shows reminders as native notifications from Electron main (§7.12). Throws
 * where the platform has none. Shown notifications stay referenced until
 * clicked or failed, so their click handlers survive garbage collection. When a
 * Windows banner times out, Electron reports close but the toast stays in the
 * notification centre, and a click there still arrives while the object lives.
 * Only the newest {@link MAX_RETAINED_NOTIFICATIONS} are kept.
 */
export function createReminderNotifications(
  options: ReminderNotificationOptions,
): ShowNotification {
  const shown = new Set<PlatformNotification>();
  const { platform } = options;
  return (notice: typeof DesktopNotification.Type) => {
    if (!platform.isSupported()) {
      throw new Error("Native notifications are not supported on this desktop.");
    }
    const notification = new platform({
      title: truncate(notice.title, MAX_TITLE_LENGTH),
      body: truncate(notice.body, MAX_BODY_LENGTH),
      icon: options.iconPath,
    });
    retain(shown, notification);
    notification.on("click", () => {
      shown.delete(notification);
      options.onActivate(notice.itemId);
    });
    notification.on("failed", (_event, error) => {
      shown.delete(notification);
      options.onFailure(new Error(error));
    });
    notification.show();
  };
}
