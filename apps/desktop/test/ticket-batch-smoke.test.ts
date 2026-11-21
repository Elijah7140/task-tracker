import type { ElectronApplication, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, firstWindow, launch } from "./support/desktop-app.js";
import { type FakeSessionBus, startFakeSessionBus } from "./support/fake-tray-host.js";
import {
  createProject,
  itemRow,
  openAppSettingsFromMenu,
  openProject,
} from "./support/workflows.js";

const PROJECT = "Plant tickets";
const BATCH_SUFFIX = "#/add-tickets";

interface TicketBatchTestState {
  menus: Electron.Menu[];
  /** The discard prompts main showed, by message. */
  prompts: string[];
  /** The button the stubbed discard prompt answers with: 0 discards, 1 keeps editing. */
  answer: number;
}
type TicketBatchTestGlobal = typeof globalThis & { ticketBatchTestState: TicketBatchTestState };

/** Windows and macOS always have a notification area; Linux needs a stand-in tray host. */
async function sessionBus(): Promise<FakeSessionBus | undefined> {
  return process.platform === "linux" ? startFakeSessionBus(true) : undefined;
}

/**
 * Records tray menus as main builds them, since the notification area is outside
 * Playwright, and answers main's native discard prompt, which Playwright cannot click.
 */
async function observeMain(application: ElectronApplication) {
  await application.evaluate(({ Tray, dialog }) => {
    const state: TicketBatchTestState = { menus: [], prompts: [], answer: 1 };
    (globalThis as TicketBatchTestGlobal).ticketBatchTestState = state;
    const original: unknown = Reflect.get(Tray.prototype, "setContextMenu");
    Tray.prototype.setContextMenu = function (this: Electron.Tray, menu: Electron.Menu | null) {
      if (menu !== null) {
        state.menus.push(menu);
      }
      Reflect.apply(original as (menu: Electron.Menu | null) => void, this, [menu]);
    };
    dialog.showMessageBoxSync = ((...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxSyncOptions;
      state.prompts.push(options.message);
      return state.answer;
    }) as typeof dialog.showMessageBoxSync;
  });
}

/** Clicks a tray menu item, as the platform reports it to main. */
async function clickTrayItem(application: ElectronApplication, label: string) {
  await expect
    .poll(() =>
      application.evaluate(
        (_electron, name) =>
          (globalThis as TicketBatchTestGlobal).ticketBatchTestState.menus
            .at(-1)
            ?.items.some((item) => item.label === name) ?? false,
        label,
      ),
    )
    .toBe(true);
  await application.evaluate((_electron, name) => {
    const menu = (globalThis as TicketBatchTestGlobal).ticketBatchTestState.menus.at(-1);
    menu?.items.find((item) => item.label === name)?.click();
  }, label);
}

function batchWindowCount(application: ElectronApplication) {
  return application.evaluate(
    ({ BrowserWindow }, suffix) =>
      BrowserWindow.getAllWindows().filter((window) => window.webContents.getURL().endsWith(suffix))
        .length,
    BATCH_SUFFIX,
  );
}

function prompts(application: ElectronApplication) {
  return application.evaluate(
    () => (globalThis as TicketBatchTestGlobal).ticketBatchTestState.prompts,
  );
}

function answerPrompt(application: ElectronApplication, answer: number) {
  return application.evaluate((_electron, button) => {
    (globalThis as TicketBatchTestGlobal).ticketBatchTestState.answer = button;
  }, answer);
}

/** Asks the add window to close, as its title-bar close button does. */
function closeBatchWindow(application: ElectronApplication) {
  return application.evaluate(({ BrowserWindow }, suffix) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().endsWith(suffix))
      ?.close();
  }, BATCH_SUFFIX);
}

async function keepRunningInTray(page: Page) {
  await openAppSettingsFromMenu(page);
  await page.getByTestId("global-keep-running-in-tray").click();
  const save = page.getByTestId("save-global-settings");
  await save.click();
  await save.and(page.locator(':disabled:not([aria-busy="true"])')).waitFor();
}

/** Opens Add tickets… from the tray menu and returns its window's page. */
async function openBatch(application: ElectronApplication) {
  const opened = application.waitForEvent("window", {
    predicate: (candidate) => candidate.url().endsWith(BATCH_SUFFIX),
  });
  await clickTrayItem(application, "Add tickets…");
  const batch = await opened;
  batch.setDefaultTimeout(5_000);
  await batch.getByTestId("add-ticket-number").waitFor();
  return batch;
}

async function addTicket(batch: Page, number: string, summary: string) {
  await batch.getByTestId("add-ticket-number").fill(number);
  await batch.getByTestId("add-title").fill(summary);
  await batch.getByTestId("add-title").press("Enter");
}

/** Launches with the tray on, a project to add to, and main observed. */
async function launchWithProject(desktop: Parameters<typeof launch>[0], bus?: FakeSessionBus) {
  const application = await launch(
    desktop,
    bus === undefined ? {} : { DBUS_SESSION_BUS_ADDRESS: bus.address },
  );
  const page = await firstWindow(application);
  await observeMain(application);
  await keepRunningInTray(page);
  await page.getByTestId("sidebar-home").click();
  await createProject(page, PROJECT);
  await openProject(page, PROJECT);
  return { application, page };
}

desktopTest(
  "Add tickets… from the tray adds a batch to the project and the main window shows it",
  async ({ desktop }) => {
    const bus = await sessionBus();
    const { application, page } = await launchWithProject(desktop, bus);
    try {
      const batch = await openBatch(application);
      expect(
        await batch.evaluate(() => ({
          require: "require" in window,
          process: "process" in window,
        })),
      ).toEqual({ require: false, process: false });
      await expect
        .poll(() => batch.getByTestId("ticket-batch-project").textContent())
        .toBe(PROJECT);

      await addTicket(batch, "385405", "Conversion data is wrong");
      await addTicket(batch, "385406", "Badge reader offline");
      await expect.poll(() => batch.getByTestId("ticket-batch-entry").count()).toBe(2);
      await batch.getByTestId("ticket-batch-done").click();

      await expect.poll(() => batchWindowCount(application)).toBe(0);
      expect(await prompts(application)).toEqual([]);
      await itemRow(page, PROJECT, "Conversion data is wrong").first().waitFor();
      await itemRow(page, PROJECT, "Badge reader offline").first().waitFor();
    } finally {
      await application.close().catch(() => {});
      await bus?.close();
    }
  },
);

desktopTest(
  "Closing the add window with unsaved tickets asks first, and Keep editing keeps them",
  async ({ desktop }) => {
    const bus = await sessionBus();
    const { application } = await launchWithProject(desktop, bus);
    try {
      const batch = await openBatch(application);
      await addTicket(batch, "7", "Replace the scanner");
      await batch.getByTestId("ticket-batch-entry").waitFor();

      await closeBatchWindow(application);
      await expect.poll(() => prompts(application)).toHaveLength(1);
      expect(await batchWindowCount(application)).toBe(1);
      expect(await batch.getByTestId("ticket-batch-entry").count()).toBe(1);
      await answerPrompt(application, 0);
      await closeBatchWindow(application);

      await expect.poll(() => batchWindowCount(application)).toBe(0);
      expect(await prompts(application)).toEqual([
        "Discard the tickets you haven't added?",
        "Discard the tickets you haven't added?",
      ]);
    } finally {
      await application.close().catch(() => {});
      await bus?.close();
    }
  },
);
