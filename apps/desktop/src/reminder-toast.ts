/** What a reminder toast shows and what a click on it opens. */
export interface ReminderToastContent {
  readonly title: string;
  readonly body: string;
  /** A `file:` URL of the checklist art. */
  readonly iconUrl: string;
  /** The toast's `launch` argument, from {@link reminderLaunchArguments}. */
  readonly launch: string;
}

/** A click that Windows reported with a reminder toast's launch argument. */
export interface ReminderLaunch {
  readonly notificationId: string;
  /** The item to open, or null for a grouped notification that opens the panel. */
  readonly itemId: string | null;
}

const LAUNCH_PREFIX = "task-tracker-reminder";
const UUID = "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";
const LAUNCH_PATTERN = new RegExp(`^${LAUNCH_PREFIX}:(${UUID}):(${UUID})?$`);

const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

/**
 * The launch argument naming the notification and the item. Windows hands it
 * back for a click in the notification centre even when the notification
 * object is gone. It avoids `&` and `=`, which Electron reads as action fields.
 */
export function reminderLaunchArguments(launch: ReminderLaunch) {
  return `${LAUNCH_PREFIX}:${launch.notificationId}:${launch.itemId ?? ""}`;
}

/** Reads a launch argument this app wrote, or undefined for anything else. */
export function parseReminderLaunch(argumentsText: string): ReminderLaunch | undefined {
  const match = LAUNCH_PATTERN.exec(argumentsText);
  if (match?.[1] === undefined) {
    return undefined;
  }
  return { notificationId: match[1], itemId: match[2] ?? null };
}

/**
 * The toast Electron would build for a title, body and icon, plus a `launch`
 * argument. Electron's own toast has none, so a click delivered through the toast
 * activator could not say which reminder it was.
 */
export function reminderToastXml(content: ReminderToastContent) {
  return [
    `<toast launch="${escapeXml(content.launch)}" activationType="foreground">`,
    "<visual>",
    '<binding template="ToastGeneric">',
    `<text>${escapeXml(content.title)}</text>`,
    `<text>${escapeXml(content.body)}</text>`,
    `<image placement="appLogoOverride" hint-crop="none" src="${escapeXml(content.iconUrl)}"/>`,
    "</binding>",
    "</visual>",
    "</toast>",
  ].join("");
}
