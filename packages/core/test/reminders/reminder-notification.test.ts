import { describe, expect, it } from "@effect/vitest";
import { recentReminderCutoff, reminderNotification } from "../../src/index.js";

const entry = (title: string) => ({ itemId: `ID-${title}`, title, projectName: "Operations" });

describe("reminderNotification", () => {
  it("Names the item when a live check finds one reminder", () => {
    const notice = reminderNotification([entry("Pay rent")], false);

    expect(notice).toEqual({ title: "Pay rent", body: "Operations", itemId: "ID-Pay rent" });
  });

  it("Groups several reminders from one live check", () => {
    const notice = reminderNotification([entry("A"), entry("B"), entry("C")], false);

    expect(notice).toEqual({
      title: "3 reminders due",
      body: "Open Task Tracker to see your reminders.",
      itemId: null,
    });
  });

  it("Groups reminders missed while the app was closed, even a single one", () => {
    const one = reminderNotification([entry("A")], true);
    const two = reminderNotification([entry("A"), entry("B")], true);

    expect(one.title).toBe("1 reminder while you were away");
    expect(one.itemId).toBeNull();
    expect(two.title).toBe("2 reminders while you were away");
  });
});

describe("recentReminderCutoff", () => {
  it("Starts the notification window twenty-four hours before now", () => {
    const now = Temporal.Instant.from("2026-11-17T12:00:00Z");

    const cutoff = recentReminderCutoff(now);

    expect(cutoff.toString()).toBe("2026-11-16T12:00:00Z");
  });
});
