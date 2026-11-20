import type { DesktopNotification } from "@task-tracker/contracts";
import { Notification } from "electron";
import type { ShowNotification } from "./native-notifier.js";

const MAX_TITLE_LENGTH = 256;
const MAX_BODY_LENGTH = 1_024;

/** Where clicked notifications and asynchronous platform failures go. */
export interface ReminderNotificationOptions {
  readonly iconPath: string;
  /** Brings the window forward and opens the item, or the panel when null. */
  readonly onActivate: (itemId: string | null) => void;
  readonly onFailure: (error: unknown) => void;
}

const truncate = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

/**
 * Shows reminders as native notifications from Electron main (§7.12). Shown
 * notifications stay referenced until clicked or closed, so their click
 * handlers survive garbage collection. Throws where the platform has none.
 */
export function createReminderNotifications(
  options: ReminderNotificationOptions,
): ShowNotification {
  const shown = new Set<Notification>();
  return (notice: typeof DesktopNotification.Type) => {
    if (!Notification.isSupported()) {
      throw new Error("Native notifications are not supported on this desktop.");
    }
    const notification = new Notification({
      title: truncate(notice.title, MAX_TITLE_LENGTH),
      body: truncate(notice.body, MAX_BODY_LENGTH),
      icon: options.iconPath,
    });
    shown.add(notification);
    notification.on("click", () => {
      shown.delete(notification);
      options.onActivate(notice.itemId);
    });
    notification.on("close", () => shown.delete(notification));
    notification.on("failed", (_event, error) => {
      shown.delete(notification);
      options.onFailure(new Error(error));
    });
    notification.show();
  };
}
