import { connect, type Socket } from "node:net";
import type { ElectronApplication, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, firstWindow, launch } from "./support/desktop-app.js";
import { type FakeSessionBus, startFakeSessionBus } from "./support/fake-tray-host.js";
import {
  addItem,
  createProject,
  expandCompleted,
  isCompleted,
  itemRow,
  itemTree,
  openAppSettingsFromMenu,
  openProject,
} from "./support/workflows.js";

const PROJECT = "Release";
const ITEM = "Ship the release";

interface TrayCardTestState {
  tray?: Electron.Tray;
}
type TrayCardTestGlobal = typeof globalThis & { trayCardTestState: TrayCardTestState };

/** Windows and macOS always have a notification area; Linux needs a stand-in tray host. */
async function sessionBus(): Promise<FakeSessionBus | undefined> {
  return process.platform === "linux" ? startFakeSessionBus(true) : undefined;
}

/** Remembers the tray icon main creates, since the notification area is outside Playwright. */
async function observeTrayIcon(application: ElectronApplication) {
  await application.evaluate(({ Tray }) => {
    const state: TrayCardTestState = {};
    (globalThis as TrayCardTestGlobal).trayCardTestState = state;
    const original: unknown = Reflect.get(Tray.prototype, "setContextMenu");
    Tray.prototype.setContextMenu = function (this: Electron.Tray, menu: Electron.Menu | null) {
      state.tray = this;
      Reflect.apply(original as (menu: Electron.Menu | null) => void, this, [menu]);
    };
  });
}

/** Left-clicks the tray icon, as the platform reports it to main. */
async function clickTrayIcon(application: ElectronApplication) {
  await expect
    .poll(() =>
      application.evaluate(
        () => (globalThis as TrayCardTestGlobal).trayCardTestState.tray !== undefined,
      ),
    )
    .toBe(true);
  await application.evaluate(() => {
    const bounds = { x: 0, y: 0, width: 0, height: 0 };
    (globalThis as TrayCardTestGlobal).trayCardTestState.tray?.emit("click", {}, bounds, {
      x: 0,
      y: 0,
    });
  });
}

/** Whether the tray card window exists and is showing. */
function cardShown(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (window) => window.webContents.getURL().endsWith("#/tray-card") && window.isVisible(),
    ),
  );
}

/** The card window's content size and position, with the primary screen's working area. */
function cardGeometry(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow, screen }) => {
    const card = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().endsWith("#/tray-card"),
    );
    const [width, height] = card?.getContentSize() ?? [];
    const [x, y] = card?.getPosition() ?? [];
    return { width, height, x, y, workArea: screen.getPrimaryDisplay().workArea };
  });
}

/** Whether the card's renderer process runs in the OS sandbox, as Electron reports on Windows. */
function cardSandboxed(application: ElectronApplication) {
  return application.evaluate(({ app, BrowserWindow }) => {
    const card = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().endsWith("#/tray-card"),
    );
    const pid = card?.webContents.getOSProcessId();
    return app.getAppMetrics().find((metric) => metric.pid === pid)?.sandboxed;
  });
}

/** The preload bridge as a page sees it; desktop tests have no renderer typings. */
interface PageWithBridge {
  readonly taskTrackerDesktop: {
    openItemFromTrayCard(itemId: string): Promise<boolean>;
    getRpcConnection(): Promise<{ readonly port: number }>;
  };
}

/** Node globals and the bridge methods a page can see. */
function pageGlobals(page: Page) {
  return page.evaluate(() => ({
    require: "require" in window,
    process: "process" in window,
    bridge: Object.keys((window as unknown as PageWithBridge).taskTrackerDesktop).sort(),
  }));
}

/** Presses Escape in the card window through Electron's native input path. */
function pressEscapeOnCard(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }) => {
    const card = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().endsWith("#/tray-card"),
    );
    card?.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  });
}

async function keepRunningInTray(page: Page) {
  await openAppSettingsFromMenu(page);
  await page.getByTestId("global-keep-running-in-tray").click();
  const save = page.getByTestId("save-global-settings");
  await save.click();
  await save.and(page.locator(':disabled:not([aria-busy="true"])')).waitFor();
}

/** Turns the tray on, adds an item and makes it current from its card menu. */
async function chooseCurrentItem(page: Page) {
  await keepRunningInTray(page);
  await page.getByTestId("sidebar-home").click();
  await createProject(page, PROJECT);
  await openProject(page, PROJECT);
  await addItem(page, PROJECT, ITEM);
  await itemRow(page, PROJECT, ITEM).getByTestId("item-title").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Set as current item" }).click();
  const star = itemRow(page, PROJECT, ITEM).getByTestId("item-card-current").first();
  await expect.poll(() => star.getAttribute("aria-pressed")).toBe("true");
}

/** Clicks the tray icon and returns the card window's page once it shows the item. */
async function openCard(application: ElectronApplication) {
  const opened = application.waitForEvent("window", {
    predicate: (candidate) => candidate.url().endsWith("#/tray-card"),
  });
  await clickTrayIcon(application);
  const card = await opened;
  card.setDefaultTimeout(5_000);
  await card.getByTestId("tray-card-title").filter({ hasText: ITEM }).waitFor();
  await expect.poll(() => cardShown(application)).toBe(true);
  return card;
}

/** Collects what Electron main writes, where it logs how each server stop ended. */
function collectMainOutput(application: ElectronApplication) {
  let output = "";
  const append = (chunk: Buffer) => {
    output += chunk.toString("utf8");
  };
  application.process().stdout?.on("data", append);
  application.process().stderr?.on("data", append);
  return () => output;
}

/**
 * Opens a connection to the RPC server that never sends a request, like the
 * spare connections Chromium opens, then waits for an answer on another
 * connection, so the server has accepted the silent one.
 */
async function openSilentConnection(page: Page): Promise<Socket> {
  const { port } = await page.evaluate(() =>
    (window as unknown as PageWithBridge).taskTrackerDesktop.getRpcConnection(),
  );
  const socket = connect({ host: "127.0.0.1", port });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve).once("error", reject);
  });
  const answer = await fetch(`http://127.0.0.1:${port}/`, { headers: { connection: "close" } });
  expect(answer.status).toBe(404);
  return socket;
}

desktopTest(
  "A tray click shows the current item card, which completes it in the main window",
  async ({ desktop }) => {
    const bus = await sessionBus();
    const application = await launch(
      desktop,
      bus === undefined ? {} : { DBUS_SESSION_BUS_ADDRESS: bus.address },
    );
    try {
      const page = await firstWindow(application);
      await observeTrayIcon(application);
      await chooseCurrentItem(page);
      const card = await openCard(application);
      expect(await pageGlobals(card)).toEqual({
        require: false,
        process: false,
        bridge: (await pageGlobals(page)).bridge,
      });
      if (process.platform === "win32") {
        expect(await cardSandboxed(application)).toBe(true);
      }
      const drawn = await card
        .getByTestId("tray-card")
        .evaluate((element) => Math.ceil(element.getBoundingClientRect().height));
      await expect.poll(async () => (await cardGeometry(application)).height).toBe(drawn);
      if (process.platform === "linux") {
        // Without a cursor position the card sits in the top-right corner (§7.18).
        const { width, x, y, workArea } = await cardGeometry(application);
        expect(width).toBe(320);
        expect({ x, y }).toEqual({
          x: workArea.x + workArea.width - 320 - 12,
          y: workArea.y + 12,
        });
      }
      const itemId = await itemRow(page, PROJECT, ITEM)
        .getByTestId("item-row")
        .first()
        .getAttribute("data-item-row-id");
      const fromMainWindow = await page.evaluate(
        (id) =>
          (window as unknown as PageWithBridge).taskTrackerDesktop.openItemFromTrayCard(id ?? ""),
        itemId,
      );
      expect(fromMainWindow).toBe(false);
      expect(await cardShown(application)).toBe(true);

      await card.getByRole("button", { name: "Mark complete" }).click();

      await card.getByTestId("tray-card-completed").waitFor();
      await expandCompleted(itemTree(page, PROJECT), "Completed (1)");
      expect(await isCompleted(itemRow(page, PROJECT, ITEM))).toBe("true");
      await pressEscapeOnCard(application);
      await expect.poll(() => cardShown(application)).toBe(false);
    } finally {
      await application.close();
      await bus?.close();
    }
  },
);

desktopTest(
  "Open in Task Tracker hides the card and opens the item in the main window",
  async ({ desktop }) => {
    const bus = await sessionBus();
    const application = await launch(
      desktop,
      bus === undefined ? {} : { DBUS_SESSION_BUS_ADDRESS: bus.address },
    );
    try {
      const page = await firstWindow(application);
      await observeTrayIcon(application);
      await chooseCurrentItem(page);
      await page.getByTestId("sidebar-home").click();
      const card = await openCard(application);

      await card.getByRole("button", { name: "Open in Task Tracker" }).click();

      await expect.poll(() => cardShown(application)).toBe(false);
      const editor = page.getByTestId("item-editor");
      await editor.waitFor();
      expect(await editor.getByTestId("item-editor-title").inputValue()).toBe(ITEM);
    } finally {
      await application.close();
      await bus?.close();
    }
  },
);

desktopTest(
  "Quitting with the main window and tray card open stops the server within two seconds",
  async ({ desktop }) => {
    const bus = await sessionBus();
    const application = await launch(
      desktop,
      bus === undefined ? {} : { DBUS_SESSION_BUS_ADDRESS: bus.address },
    );
    const mainOutput = collectMainOutput(application);
    let silent: Socket | undefined;
    try {
      const page = await firstWindow(application);
      await observeTrayIcon(application);
      await chooseCurrentItem(page);
      await openCard(application);
      silent = await openSilentConnection(page);

      await application.close();

      const output = mainOutput();
      expect(output).not.toContain("was killed");
      const stopped = /Task Tracker server stopped in (\d+) ms\./.exec(output);
      expect(Number(stopped?.[1])).toBeLessThan(2_000);
    } finally {
      silent?.destroy();
      await application.close();
      await bus?.close();
    }
  },
);
