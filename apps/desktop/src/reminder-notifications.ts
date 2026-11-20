import { pathToFileURL } from "node:url";
import type { DesktopNotification } from "@task-tracker/contracts";
import type { ShowNotification } from "./native-notifier.js";
import {
  parseReminderLaunch,
  reminderLaunchArguments,
  reminderToastXml,
} from "./reminder-toast.js";

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

/** What the reminders pass to Electron's `Notification` constructor. */
export interface PlatformNotificationOptions {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly icon: string;
  /** Windows only: the whole toast, which carries the launch argument. */
  readonly toastXml?: string;
}

/** Electron's `Notification` class, passed in by Electron main. */
export interface NotificationPlatform {
  isSupported(): boolean;
  new (options: PlatformNotificationOptions): PlatformNotification;
}

/** Where clicked notifications and asynchronous platform failures go. */
export interface ReminderNotificationOptions {
  readonly iconPath: string;
  /** Brings the window forward and opens the item, or the panel when null. */
  readonly onActivate: (itemId: string | null) => void;
  readonly onFailure: (error: unknown) => void;
  readonly platform: NotificationPlatform;
  /** Whether toasts carry a launch argument for Windows' toast activator. */
  readonly windowsToasts: boolean;
  /** A fresh UUID for each notification, `crypto.randomUUID` in main. */
  readonly newNotificationId: () => string;
}

/** Shows reminders and opens the item a click names, however the click arrives. */
export interface ReminderNotifications {
  readonly show: ShowNotification;
  /**
   * Handles a click Windows delivered through the toast activator, with the
   * toast's launch argument. False when the argument is not a reminder's.
   */
  readonly activateFromLaunch: (argumentsText: string) => boolean;
}

const truncate = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

/** Adds `value` to a set that keeps only its newest {@link MAX_RETAINED_NOTIFICATIONS} entries. */
function addCapped<Value>(set: Set<Value>, value: Value) {
  set.add(value);
  const oldest = set.values().next().value;
  if (set.size > MAX_RETAINED_NOTIFICATIONS && oldest !== undefined) {
    set.delete(oldest);
  }
}

/** The constructor options, with the launch argument in the toast on Windows. */
function platformOptions(
  options: ReminderNotificationOptions,
  notice: typeof DesktopNotification.Type,
  notificationId: string,
): PlatformNotificationOptions {
  const title = truncate(notice.title, MAX_TITLE_LENGTH);
  const body = truncate(notice.body, MAX_BODY_LENGTH);
  const base = { id: notificationId, title, body, icon: options.iconPath };
  if (!options.windowsToasts) {
    return base;
  }
  const launch = reminderLaunchArguments({ notificationId, itemId: notice.itemId });
  const iconUrl = pathToFileURL(options.iconPath).href;
  return { ...base, toastXml: reminderToastXml({ title, body, iconUrl, launch }) };
}

/**
 * Shows reminders as native notifications from Electron main (§7.12). Throws
 * where the platform has none. Shown notifications stay referenced until
 * clicked or failed, so their click handlers survive garbage collection. When a
 * Windows banner times out, Electron reports close but the toast stays in the
 * notification centre, and a click there still arrives while the object lives.
 * Only the newest {@link MAX_RETAINED_NOTIFICATIONS} are kept.
 *
 * Windows may instead deliver a click through the toast activator, as after a
 * restart, and then only the launch argument says which reminder it was. Each
 * notification opens its item once, whichever way its click arrives.
 */
export function createReminderNotifications(
  options: ReminderNotificationOptions,
): ReminderNotifications {
  const shown = new Set<PlatformNotification>();
  const activated = new Set<string>();
  const { platform } = options;

  const activate = (notificationId: string, itemId: string | null) => {
    if (activated.has(notificationId)) {
      return;
    }
    addCapped(activated, notificationId);
    options.onActivate(itemId);
  };

  const show = (notice: typeof DesktopNotification.Type) => {
    if (!platform.isSupported()) {
      throw new Error("Native notifications are not supported on this desktop.");
    }
    const notificationId = options.newNotificationId();
    const notification = new platform(platformOptions(options, notice, notificationId));
    addCapped(shown, notification);
    notification.on("click", () => {
      shown.delete(notification);
      activate(notificationId, notice.itemId);
    });
    notification.on("failed", (_event, error) => {
      shown.delete(notification);
      options.onFailure(new Error(error));
    });
    notification.show();
  };

  const activateFromLaunch = (argumentsText: string) => {
    const launch = parseReminderLaunch(argumentsText);
    if (launch !== undefined) {
      activate(launch.notificationId, launch.itemId);
    }
    return launch !== undefined;
  };

  return { show, activateFromLaunch };
}
