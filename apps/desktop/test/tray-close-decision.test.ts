import { describe, expect, it } from "vitest";
import {
  decideTrayClose,
  type TrayCloseState,
  type WindowCloseReason,
} from "../src/tray-close-decision.js";

const keepRunning: TrayCloseState = {
  keepRunningInTray: true,
  trayIconShown: true,
  minimized: false,
  quitting: false,
};

describe("decideTrayClose", () => {
  it("Closing hides to the tray only when a tray icon is shown", () => {
    const state = keepRunning;

    const action = decideTrayClose(state, "user");

    expect(action).toBe("hide-to-tray");
  });

  it("Closing without a tray host minimises so the window stays reachable", () => {
    const state = { ...keepRunning, trayIconShown: false };

    const action = decideTrayClose(state, "user");

    expect(action).toBe("minimize");
  });

  it("Closing an already minimised window without a tray host quits", () => {
    const state = { ...keepRunning, trayIconShown: false, minimized: true };

    const action = decideTrayClose(state, "user");

    expect(action).toBe("close");
  });

  it.each<[boolean, boolean, WindowCloseReason]>([
    [false, false, "user"],
    [true, true, "user"],
    [true, false, "application"],
    [true, false, "system"],
  ])(
    "Closing quits when the setting is %s, quitting is %s or the reason is %s",
    (keepRunningInTray, quitting, reason) => {
      const state = { ...keepRunning, keepRunningInTray, quitting };

      const action = decideTrayClose(state, reason);

      expect(action).toBe("close");
    },
  );
});
