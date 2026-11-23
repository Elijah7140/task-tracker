import { spawn } from "node:child_process";
import { once } from "node:events";
import type { ElectronApplication, Page } from "playwright";
import { expect } from "vitest";
import {
  type DesktopFixture,
  desktopEnvironment,
  desktopTest,
  executable,
  firstWindow,
  launch,
} from "../support/desktop-app.js";
import { openAppSettingsFromMenu } from "../support/workflows.js";
import { isRunning, serverPid } from "../support/desktop-processes.js";
import { type FakeSessionBus, startFakeSessionBus } from "../support/fake-tray-host.js";

interface TrayState {
  menus: Electron.Menu[];
}
type TrayTestGlobal = typeof globalThis & { desktopTrayState: TrayState };

/**
 * Windows and macOS always have a notification area. On Linux the app looks for
 * a StatusNotifierWatcher, so each test gets a private bus with or without one.
 */
async function sessionBus(withTrayHost: boolean): Promise<FakeSessionBus | undefined> {
  return process.platform === "linux" ? startFakeSessionBus(withTrayHost) : undefined;
}

function busEnvironment(bus: FakeSessionBus | undefined): NodeJS.ProcessEnv {
  return bus === undefined ? {} : { DBUS_SESSION_BUS_ADDRESS: bus.address };
}

/** Records tray menus as main builds them, since the notification area is outside Playwright. */
async function observeTray(application: ElectronApplication) {
  await application.evaluate(({ Tray }) => {
    const state: TrayState = { menus: [] };
    (globalThis as TrayTestGlobal).desktopTrayState = state;
    const original: unknown = Reflect.get(Tray.prototype, "setContextMenu");
    Tray.prototype.setContextMenu = function (this: Electron.Tray, menu: Electron.Menu | null) {
      if (menu !== null) {
        state.menus.push(menu);
      }
      Reflect.apply(original as (menu: Electron.Menu | null) => void, this, [menu]);
    };
  });
  return {
    labels: () =>
      application.evaluate(() =>
        (globalThis as TrayTestGlobal).desktopTrayState.menus
          .at(-1)
          ?.items.map(({ label }) => label),
      ),
    click: (label: string) =>
      application.evaluate((_electron, name) => {
        const menu = (globalThis as TrayTestGlobal).desktopTrayState.menus.at(-1);
        const item = menu?.items.find((candidate) => candidate.label === name);
        item?.click();
      }, label),
  };
}

function windowState(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    return { count: windows.length, visible: windows[0]?.isVisible() ?? false };
  });
}

/** Asks the window to close, as its title-bar close button does. */
function closeWindow(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
}

async function keepRunningInTray(page: Page) {
  await openAppSettingsFromMenu(page);
  await page.getByTestId("global-keep-running-in-tray").click();
  const save = page.getByTestId("save-global-settings");
  await save.click();
  await save.and(page.locator(':disabled:not([aria-busy="true"])')).waitFor();
}

/** Starts another instance on the same database and returns its exit code and signal. */
async function runSecondInstance(desktop: DesktopFixture, bus: FakeSessionBus | undefined) {
  const secondInstance = spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: desktopEnvironment(desktop, busEnvironment(bus)),
    stdio: "ignore",
  });
  try {
    return await once(secondInstance, "exit");
  } finally {
    if (secondInstance.exitCode === null) {
      secondInstance.kill();
    }
  }
}

/** Launches with the tray setting turned on and the tray menu observed. */
async function launchKeepingTray(desktop: DesktopFixture, bus: FakeSessionBus | undefined) {
  const application = await launch(desktop, busEnvironment(bus));
  const page = await firstWindow(application);
  const tray = await observeTray(application);
  await keepRunningInTray(page);
  await expect.poll(tray.labels).toEqual(["Open", "Add tickets…", "Quit"]);
  return { application, page, tray };
}

desktopTest(
  "Closing hides to the tray, Open shows the window and Quit stops the server",
  async ({ desktop }) => {
    const bus = await sessionBus(true);
    const { application, tray } = await launchKeepingTray(desktop, bus);
    try {
      const server = await serverPid(application);

      await closeWindow(application);
      await expect.poll(() => windowState(application)).toEqual({ count: 1, visible: false });
      expect(isRunning(server)).toBe(true);
      await tray.click("Open");
      await expect.poll(() => windowState(application)).toEqual({ count: 1, visible: true });
      await closeWindow(application);
      await expect.poll(() => windowState(application)).toEqual({ count: 1, visible: false });
      const exited = once(application.process(), "exit");
      await tray.click("Quit");
      await exited;

      await expect.poll(() => isRunning(server)).toBe(false);
    } finally {
      await application.close().catch(() => {});
      await bus?.close();
    }
  },
);

desktopTest("A second launch shows the window hidden in the tray", async ({ desktop }) => {
  const bus = await sessionBus(true);
  const { application, page } = await launchKeepingTray(desktop, bus);
  try {
    const server = await serverPid(application);
    await closeWindow(application);
    await expect.poll(() => windowState(application)).toEqual({ count: 1, visible: false });

    expect(await runSecondInstance(desktop, bus)).toEqual([0, null]);

    await expect.poll(() => windowState(application)).toEqual({ count: 1, visible: true });
    expect(await serverPid(application)).toBe(server);
    await page.getByTestId("save-global-settings").waitFor();
  } finally {
    await application.close();
    await bus?.close();
  }
});

desktopTest(
  "Turning the setting off removes the tray and closing quits again",
  async ({ desktop }) => {
    const bus = await sessionBus(true);
    const { application, page } = await launchKeepingTray(desktop, bus);
    try {
      const server = await serverPid(application);

      await keepRunningInTray(page);
      const exited = once(application.process(), "exit");
      await closeWindow(application);
      await exited;

      await expect.poll(() => isRunning(server)).toBe(false);
    } finally {
      await application.close().catch(() => {});
      await bus?.close();
    }
  },
);

// Windows and macOS always have a notification area, so only Linux can lack a tray host.
desktopTest.runIf(process.platform === "linux")(
  "Without a tray host, closing keeps the window reachable instead of hiding it",
  async ({ desktop }) => {
    const bus = await sessionBus(false);
    const application = await launch(desktop, busEnvironment(bus));
    try {
      const page = await firstWindow(application);
      const tray = await observeTray(application);
      await keepRunningInTray(page);
      const server = await serverPid(application);

      await closeWindow(application);

      await expect.poll(() => windowState(application)).toEqual({ count: 1, visible: true });
      expect(await tray.labels()).toBeUndefined();
      expect(isRunning(server)).toBe(true);
    } finally {
      await application.close();
      await bus?.close();
    }
  },
);
