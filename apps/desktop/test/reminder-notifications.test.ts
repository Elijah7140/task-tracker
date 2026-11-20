import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MAX_RETAINED_NOTIFICATIONS,
  createReminderNotifications,
} from "../src/reminder-notifications.js";

setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

/** Weak handles to every notification created, so the test never keeps one alive itself. */
let created: WeakRef<FakeNotification>[] = [];

/** Stands in for Electron's Notification: an emitter that records nothing strongly. */
class FakeNotification extends EventEmitter {
  static isSupported() {
    return true;
  }

  constructor(readonly options: { title: string; body: string; icon: string }) {
    super();
    created.push(new WeakRef(this));
  }

  show() {}
}

function setUp() {
  created = [];
  const activated: (string | null)[] = [];
  const show = createReminderNotifications({
    iconPath: "icon.png",
    onActivate: (itemId) => activated.push(itemId),
    onFailure: () => {},
    platform: FakeNotification,
  });
  return { show, activated };
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
});
