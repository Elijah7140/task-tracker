import { describe, expect, it } from "vitest";
import {
  parseReminderLaunch,
  reminderLaunchArguments,
  reminderToastXml,
} from "../src/reminder-toast.js";

const NOTIFICATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ITEM_ID = "7C9E6679-7425-40DE-944B-E07FC1F90AE7";

describe("reminderLaunchArguments", () => {
  it("Reads back the notification and the item it names", () => {
    const launch = reminderLaunchArguments({ notificationId: NOTIFICATION_ID, itemId: ITEM_ID });

    const parsed = parseReminderLaunch(launch);

    expect(parsed).toEqual({ notificationId: NOTIFICATION_ID, itemId: ITEM_ID });
  });

  it("Reads a grouped notification as one that opens the panel", () => {
    const launch = reminderLaunchArguments({ notificationId: NOTIFICATION_ID, itemId: null });

    const parsed = parseReminderLaunch(launch);

    expect(parsed).toEqual({ notificationId: NOTIFICATION_ID, itemId: null });
  });

  it("Avoids the characters Electron reads as action fields", () => {
    const launch = reminderLaunchArguments({ notificationId: NOTIFICATION_ID, itemId: ITEM_ID });

    expect(launch).not.toMatch(/[&=]/);
  });

  it("Ignores arguments this app did not write", () => {
    const foreign = [
      "",
      "type=action&action=0&tag=abc",
      `task-tracker-reminder:${NOTIFICATION_ID}:not-a-guid`,
      `task-tracker-reminder:${NOTIFICATION_ID}:${ITEM_ID}:extra`,
    ];

    const parsed = foreign.map(parseReminderLaunch);

    expect(parsed).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("reminderToastXml", () => {
  it("Puts the launch argument on the toast and escapes the reminder text", () => {
    const xml = reminderToastXml({
      title: 'Call "Bob" & <Ann>',
      body: "Smoke's Project",
      iconUrl: "file:///C:/Program%20Files/icon.png",
      launch: `task-tracker-reminder:${NOTIFICATION_ID}:${ITEM_ID}`,
    });

    expect(xml).toContain(
      `<toast launch="task-tracker-reminder:${NOTIFICATION_ID}:${ITEM_ID}" activationType="foreground">`,
    );
    expect(xml).toContain("<text>Call &quot;Bob&quot; &amp; &lt;Ann&gt;</text>");
    expect(xml).toContain("<text>Smoke&apos;s Project</text>");
    expect(xml).toContain(
      'placement="appLogoOverride" hint-crop="none" src="file:///C:/Program%20Files/icon.png"',
    );
  });
});
