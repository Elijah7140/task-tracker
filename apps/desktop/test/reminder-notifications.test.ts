import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MAX_RETAINED_NOTIFICATIONS,
  type PlatformNotificationOptions,
  createReminderNotifications,
} from "../src/reminder-notifications.js";
import { parseReminderLaunch } from "../src/reminder-toast.js";

setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

const ITEM_ID = "7C9E6679-7425-40DE-944B-E07FC1F90AE7";
const ICON_PATH = resolve("Task Tracker", "resources", "icon.png");

/** Weak handles to every notification created, so the test never keeps one alive itself. */
let created: WeakRef<FakeNotification>[] = [];

/** Stands in for Electron's Notification: an emitter that records nothing strongly. */
class FakeNotification extends EventEmitter {
  static isSupported() {
    return true;
  }

  constructor(readonly options: PlatformNotificationOptions) {
    super();
    created.push(new WeakRef(this));
  }

  show() {}
}

function setUp(windowsToasts = false) {
  created = [];
  const activated: (string | null)[] = [];
  let sequence = 0;
  const reminders = createReminderNotifications({
    iconPath: ICON_PATH,
    onActivate: (itemId) => activated.push(itemId),
    onFailure: () => {},
    platform: FakeNotification,
    windowsToasts,
    newNotificationId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
  return { ...reminders, activated };
}

/** The launch argument of the toast the notification at `index` shows on Windows. */
function launchOf(index: number) {
  const xml = created[index]?.deref()?.options.toastXml ?? "";
  return /launch="([^"]*)"/.exec(xml)?.[1] ?? "";
}

/** Lets the job that created a WeakRef end, then runs a full collection. */
async function collect() {
  await delay(0);
  collectGarbage();
}

describe("createReminderNotifications", () => {
  it("Keeps a notification whose banner closed, so a click in the notification centre opens the item", async () => {
    const { show, activated } = setUp();
    show({ title: "Call the supplier", body: "Smoke Project", itemId: "item-1" });
    created[0]?.deref()?.emit("close");

    await collect();
    created[0]?.deref()?.emit("click", {});

    expect(activated).toEqual(["item-1"]);
  });

  it("Releases a notification once it has been clicked", async () => {
    const { show } = setUp();
    show({ title: "Call the supplier", body: "Smoke Project", itemId: "item-1" });
    created[0]?.deref()?.emit("click", {});

    await collect();

    expect(created[0]?.deref()).toBeUndefined();
  });

  it("Keeps only the most recent notifications referenced", async () => {
    const { show } = setUp();
    for (let index = 0; index <= MAX_RETAINED_NOTIFICATIONS; index++) {
      show({ title: `Reminder ${index}`, body: "Smoke Project", itemId: `item-${index}` });
    }

    await collect();

    expect(created[0]?.deref()).toBeUndefined();
    expect(created.at(-1)?.deref()).toBeDefined();
  });

  it("Opens the item a toast activator click names, as after the notification object is gone", () => {
    const { show, activateFromLaunch, activated } = setUp(true);
    show({ title: "Call the supplier", body: "Smoke Project", itemId: ITEM_ID });

    const handled = activateFromLaunch(launchOf(0));

    expect(handled).toBe(true);
    expect(activated).toEqual([ITEM_ID]);
  });

  it("Opens the panel for a grouped notification clicked through the toast activator", () => {
    const { show, activateFromLaunch, activated } = setUp(true);
    show({ title: "3 reminders", body: "Open the reminders panel", itemId: null });

    activateFromLaunch(launchOf(0));

    expect(activated).toEqual([null]);
  });

  it("Opens the item once when the same click arrives as an event and through the activator", () => {
    const { show, activateFromLaunch, activated } = setUp(true);
    show({ title: "Call the supplier", body: "Smoke Project", itemId: ITEM_ID });

    created[0]?.deref()?.emit("click", {});
    activateFromLaunch(launchOf(0));

    expect(activated).toEqual([ITEM_ID]);
  });

  it("Ignores activator clicks that carry no reminder's launch argument", () => {
    const { activateFromLaunch, activated } = setUp(true);

    const handled = activateFromLaunch("type=action&action=0&tag=other");

    expect(handled).toBe(false);
    expect(activated).toEqual([]);
  });

  it("Gives each Windows toast its notification ID, item and icon", () => {
    const { show } = setUp(true);

    show({ title: "Call the supplier", body: "Smoke Project", itemId: ITEM_ID });

    const options = created[0]?.deref()?.options;
    expect(options?.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(parseReminderLaunch(launchOf(0))).toEqual({
      notificationId: options?.id,
      itemId: ITEM_ID,
    });
    expect(options?.toastXml).toContain(`src="${pathToFileURL(ICON_PATH).href}"`);
  });

  it("Leaves the toast to the platform outside Windows", () => {
    const { show } = setUp(false);

    show({ title: "Call the supplier", body: "Smoke Project", itemId: ITEM_ID });

    const options = created[0]?.deref()?.options;
    expect(options?.toastXml).toBeUndefined();
    expect(options?.title).toBe("Call the supplier");
  });
});
