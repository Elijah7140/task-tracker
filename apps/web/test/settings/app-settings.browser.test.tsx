import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { STARTUP_ENTRY_FAILED_MESSAGE } from "../../src/settings/global-defaults-card.js";
import { FakeDesktopInstallation } from "../support/fake-desktop-installation.js";
import { DEFAULT_REMINDERS } from "../support/fake-settings-lookups.js";
import { trashBatch } from "../support/fake-trash-handlers.js";
import { renderApp } from "../support/render-app.js";
import { chooseMenuCommand } from "../support/menu-bar.js";
import { matchShellAtBothSizes, settleTheme, THEMES } from "../support/screenshots.js";

const TICKS_PER_HOUR = 36_000_000_000n;
const daysTicks = (count: number) => String(BigInt(count) * 24n * TICKS_PER_HOUR);
const hoursTicks = (count: number) => String(BigInt(count) * TICKS_PER_HOUR);

const DEFAULT_LAYOUT = {
  scaleCardColumnsToWindow: true,
  addLinePosition: "Top",
  detailsPanelPosition: "Side",
};
const openSettingsFromMenu = () => chooseMenuCommand("file", "menu-app-settings");
const autoCompleteBox = () => page.getByTestId("global-auto-complete");
const yellowAmount = () => page.getByTestId("global-yellow-amount");
const yellowUnit = () => page.getByTestId("global-yellow-unit");
const redAmount = () => page.getByTestId("global-red-amount");
const redUnit = () => page.getByTestId("global-red-unit");
const saveButton = () => page.getByTestId("save-global-settings");
const cardColumns = () => page.getByRole("combobox", { name: "Cards per row" });
const backButton = () => page.getByTestId("app-settings-back");
const appSettingsHeading = () => page.getByRole("heading", { level: 1, name: "App Settings" });
const startWithSystemBox = () =>
  page.getByRole("checkbox", { name: "Start Task Tracker when I sign in" });

async function openAppSettings(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp(options);
  await openSettingsFromMenu();
  await expect.element(page.getByRole("heading", { level: 1, name: "App Settings" })).toBeVisible();
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Opens App Settings in an installed desktop build that offers start with system. */
async function openInstalledSettings(
  options: Parameters<typeof renderApp>[0] = {},
  available = true,
) {
  const desktop = new FakeDesktopInstallation().install();
  desktop.installation = { ...desktop.installation, startWithSystemAvailable: available };
  const app = await openAppSettings(options);
  await expect.element(page.getByTestId("about-card")).toBeVisible();
  return { ...app, desktop };
}

describe("Start with system", () => {
  it("Is hidden where the build does not offer it", async () => {
    await openInstalledSettings({}, false);

    await expect.element(page.getByTestId("global-keep-running-in-tray")).toBeVisible();
    await expect.element(startWithSystemBox()).not.toBeInTheDocument();
  });

  it("Is hidden outside the desktop app", async () => {
    await openAppSettings();

    await expect.element(page.getByTestId("global-keep-running-in-tray")).toBeVisible();
    await expect.element(startWithSystemBox()).not.toBeInTheDocument();
  });

  it("Ticking it with Space and saving persists it and writes the entry", async () => {
    const { store, desktop } = await openInstalledSettings();
    await expect.element(startWithSystemBox()).not.toBeChecked();

    startWithSystemBox().element().focus();
    await userEvent.keyboard(" ");
    await expect.element(startWithSystemBox()).toBeChecked();
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.startWithSystem).toBe(true);
    await expect.poll(() => desktop.applied).toEqual([true]);
    await expect.element(page.getByTestId("global-settings-error")).not.toBeInTheDocument();
  });

  it("Turning it off removes the entry", async () => {
    const { store, desktop } = await openInstalledSettings({
      configure: (appStore) =>
        appStore.settingsAndLookups.setGlobalSettings({ startWithSystem: true }),
    });
    await expect.element(startWithSystemBox()).toBeChecked();

    await startWithSystemBox().click();
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.startWithSystem).toBe(false);
    await expect.poll(() => desktop.applied).toEqual([false]);
  });

  it("Saving other defaults rewrites the entry to match the stored choice", async () => {
    const { desktop } = await openInstalledSettings({
      configure: (appStore) =>
        appStore.settingsAndLookups.setGlobalSettings({ startWithSystem: true }),
    });

    await yellowAmount().fill("4");
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    await expect.poll(() => desktop.applied).toEqual([true]);
  });

  it("Where it is unavailable, saving neither changes nor applies the stored choice", async () => {
    const { store, desktop } = await openInstalledSettings(
      {
        configure: (appStore) =>
          appStore.settingsAndLookups.setGlobalSettings({ startWithSystem: true }),
      },
      false,
    );

    await yellowAmount().fill("4");
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.startWithSystem).toBe(true);
    await expect.poll(() => desktop.applied).toEqual([]);
  });

  it("A refused entry change keeps the saved choice and says so", async () => {
    const { store, desktop } = await openInstalledSettings();
    desktop.startupSucceeds = false;

    await startWithSystemBox().click();
    await saveButton().click();

    await expect
      .element(page.getByTestId("global-settings-error"))
      .toHaveTextContent(STARTUP_ENTRY_FAILED_MESSAGE);
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.startWithSystem).toBe(true);
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed global defaults baseline with start with system", async () => {
      await openInstalledSettings();
      await startWithSystemBox().click();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("global-defaults-card"))
        .toMatchScreenshot(`global-defaults-startup-${theme}`);
    });
  });
});

describe("AppSettingsPage", () => {
  it("Opens from File → Settings", async () => {
    const { history } = await openAppSettings();

    await expect.element(appSettingsHeading()).toBeVisible();
    expect(history.location.pathname).toBe("/settings");
  });

  it("Loads global defaults and keeps Save defaults disabled until edited", async () => {
    await openAppSettings();

    await expect.element(autoCompleteBox()).toBeChecked();
    await expect.element(yellowAmount()).toHaveValue("3");
    await expect.element(yellowUnit()).toHaveTextContent("days");
    await expect.element(redAmount()).toHaveValue("24");
    await expect.element(redUnit()).toHaveTextContent("hours");
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Disables saving when red threshold exceeds yellow and persists nothing", async () => {
    const { store } = await openAppSettings();

    await redAmount().fill("100");

    await expect
      .element(page.getByTestId("global-settings-error"))
      .toHaveTextContent("Red threshold must be no greater than yellow.");
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.urgencyRedThreshold).toBe(hoursTicks(24));
  });

  it("Persists updated thresholds and units and disables Save again after saving", async () => {
    const { store } = await openAppSettings();

    await yellowAmount().fill("4");
    await redAmount().fill("30");
    await expect.element(saveButton()).toBeEnabled();
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings).toEqual({
      autoCompleteParents: true,
      urgencyYellowThreshold: daysTicks(4),
      urgencyRedThreshold: hoursTicks(30),
      workspaceCardColumns: 4,
      reminders: DEFAULT_REMINDERS,
      keepRunningInTray: false,
      startWithSystem: false,
      addOpensDetails: { todo: false, ticket: false },
      autoHideCompleted: true,
      urgencyColors: { approaching: null, overdue: null },
      trayCard: { size: "Full", showItems: true },
      showTicketDetailOnCards: true,
      workspaceLayout: DEFAULT_LAYOUT,
    });
  });

  it("Saves Auto-hide completed, on by default, from the keyboard", async () => {
    const { store } = await openAppSettings();
    const autoHide = page.getByRole("checkbox", { name: "Auto-hide completed ToDos right away" });
    await expect.element(autoHide).toBeChecked();

    autoHide.element().focus();
    await userEvent.keyboard(" ");
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    await expect.element(autoHide).not.toBeChecked();
    expect(store.settingsAndLookups.globalSettings.autoHideCompleted).toBe(false);
  });

  it("Chooses Cards per row from the keyboard and saves it with the other defaults", async () => {
    const { store } = await openAppSettings();
    await expect.element(cardColumns()).toHaveTextContent("4");

    cardColumns().element().focus();
    await userEvent.keyboard("{Enter}");
    await page.getByRole("option", { name: "6", exact: true }).click();
    await expect.element(cardColumns()).toHaveTextContent("6");
    await expect.element(saveButton()).toBeEnabled();
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.workspaceCardColumns).toBe(6);
    expect(store.settingsAndLookups.globalSettings.urgencyYellowThreshold).toBe(daysTicks(3));
  });

  it("Saves the tray card size and whether tray cards show their items", async () => {
    const { store } = await openAppSettings();
    const size = page.getByRole("combobox", { name: "Tray card size" });
    await expect.element(size).toHaveTextContent("Full");

    await size.click();
    await page.getByRole("option", { name: "Compact", exact: true }).click();
    await page.getByRole("checkbox", { name: "Show items on tray cards" }).click();
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.trayCard).toEqual({
      size: "Compact",
      showItems: false,
    });
  });

  it("Saves the workspace layout choices with the other defaults", async () => {
    const { store } = await openAppSettings();
    const scale = page.getByTestId("global-scale-card-columns");
    const addLine = page.getByRole("combobox", { name: "Add-item line position" });
    const details = page.getByRole("combobox", { name: "Item details position" });
    await expect.element(scale).toBeChecked();
    await expect.element(addLine).toHaveTextContent("Top");
    await expect.element(details).toHaveTextContent("Side");

    await scale.click();
    await addLine.click();
    await page.getByRole("option", { name: "Bottom", exact: true }).click();
    details.element().focus();
    await userEvent.keyboard("{Enter}");
    await page.getByRole("option", { name: "Top", exact: true }).click();
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.workspaceLayout).toEqual({
      scaleCardColumnsToWindow: false,
      addLinePosition: "Bottom",
      detailsPanelPosition: "Top",
    });
  });

  it("Updates validation and persisted ticks when changing a threshold unit", async () => {
    const { store } = await openAppSettings();

    await yellowUnit().click();
    await page.getByRole("option", { name: "hours" }).click();

    await expect
      .element(page.getByTestId("global-settings-error"))
      .toHaveTextContent("Red threshold must be no greater than yellow.");

    await yellowAmount().fill("48");
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.urgencyYellowThreshold).toBe(hoursTicks(48));
  });

  it("Turns auto-complete off without prompting", async () => {
    const { store } = await openAppSettings();

    await autoCompleteBox().click();
    await saveButton().click();

    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.autoCompleteParents).toBe(false);
  });

  it("Enables auto-complete without prompting when no parents disagree", async () => {
    const { store } = await openAppSettings({
      projects: [{ name: "Billing DB" }],
      configure: (appStore) => {
        appStore.settingsAndLookups.setGlobalSettings({ autoCompleteParents: false });
      },
    });

    await autoCompleteBox().click();
    await saveButton().click();

    await expect.poll(() => store.settingsAndLookups.globalSettings.autoCompleteParents).toBe(true);
    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(store.calls).toContain("PreviewGlobalAutoComplete");
  });

  it("Prompts to reconcile when enabling auto-complete with disagreements and saves only on confirm", async () => {
    const { store } = await openAppSettings({
      projects: [{ name: "Billing DB" }],
      configure: (appStore) => {
        appStore.settingsAndLookups.setGlobalSettings({ autoCompleteParents: false });
        const projectId = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setDisagreements(projectId, {
          parentIdsToComplete: ["0190A1B2-0000-7000-8000-000000000901"],
          parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000902"],
        });
      },
    });

    await autoCompleteBox().click();
    await saveButton().click();

    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "Turning this on will complete 1 parents and reopen 1 parents. Continue?",
      );

    await userEvent.keyboard("{Escape}");

    await expect.element(dialog).not.toBeInTheDocument();
    expect(store.calls).not.toContain("SaveGlobalSettings");
    expect(store.settingsAndLookups.globalSettings.autoCompleteParents).toBe(false);
    expect(store.settingsAndLookups.reconciledProjects).toEqual([]);

    await saveButton().click();
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => store.settingsAndLookups.globalSettings.autoCompleteParents).toBe(true);
    await expect.element(saveButton()).not.toHaveAttribute("aria-busy");
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.reconciledProjects).toHaveLength(1);
  });

  it("Re-prompts when affected parents change before confirmation is saved", async () => {
    const { store } = await openAppSettings({
      projects: [{ name: "Billing DB" }],
      configure: (appStore) => {
        appStore.settingsAndLookups.setGlobalSettings({ autoCompleteParents: false });
        const projectId = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setDisagreements(projectId, {
          parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000901"],
        });
      },
    });
    const projectId = store.summaries[0]!.project.id;

    await autoCompleteBox().click();
    await saveButton().click();

    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect.element(dialog).toBeVisible();

    store.settingsAndLookups.setDisagreements(projectId, {
      parentIdsToComplete: ["0190A1B2-0000-7000-8000-000000000903"],
      parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000904"],
    });

    await page.getByTestId("confirm-dialog-confirm").click();

    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "Affected items changed. Turning this on will complete 1 parents and reopen 1 parents. Continue?",
      );

    await page.getByTestId("confirm-dialog-confirm").click();

    await expect.poll(() => store.settingsAndLookups.globalSettings.autoCompleteParents).toBe(true);
    await expect.element(saveButton()).not.toHaveAttribute("aria-busy");
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.reconciledProjects[0]).toEqual({
      projectId,
      completed: ["0190A1B2-0000-7000-8000-000000000903"],
      reopened: ["0190A1B2-0000-7000-8000-000000000904"],
    });
  });

  it("Shows the conflicting project's error from the server and saves none of the three values", async () => {
    const { store } = await openAppSettings({
      projects: [{ name: "Billing DB" }],
      configure: (appStore) => {
        const projectId = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(projectId, {
          urgencyYellowThreshold: daysTicks(2),
        });
      },
    });

    await autoCompleteBox().click();
    await yellowAmount().fill("4");
    await redAmount().fill("72");
    await saveButton().click();

    await expect
      .element(page.getByTestId("global-settings-error"))
      .toHaveTextContent(
        "Project 'Billing DB' overrides the yellow threshold to 2 days, so the red threshold can't exceed it.",
      );
    expect(store.settingsAndLookups.globalSettings).toEqual({
      autoCompleteParents: true,
      urgencyYellowThreshold: daysTicks(3),
      urgencyRedThreshold: hoursTicks(24),
      workspaceCardColumns: 4,
      reminders: DEFAULT_REMINDERS,
      keepRunningInTray: false,
      startWithSystem: false,
      addOpensDetails: { todo: false, ticket: false },
      autoHideCompleted: true,
      urgencyColors: { approaching: null, overdue: null },
      trayCard: { size: "Full", showItems: true },
      showTicketDetailOnCards: true,
      workspaceLayout: DEFAULT_LAYOUT,
    });
  });

  it("Saves nothing when confirmed global auto-complete enable fails threshold validation on the server", async () => {
    const { store } = await openAppSettings({
      projects: [{ name: "Billing DB" }],
      configure: (appStore) => {
        appStore.settingsAndLookups.setGlobalSettings({ autoCompleteParents: false });
        const projectId = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(projectId, {
          urgencyYellowThreshold: daysTicks(2),
        });
        appStore.settingsAndLookups.setDisagreements(projectId, {
          parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000930"],
        });
      },
    });

    await autoCompleteBox().click();
    await yellowAmount().fill("4");
    await redAmount().fill("72");
    await cardColumns().click();
    await page.getByRole("option", { name: "6", exact: true }).click();
    await expect.element(cardColumns()).toHaveTextContent("6");
    await saveButton().click();

    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect.element(dialog).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect
      .element(page.getByTestId("global-settings-error"))
      .toHaveTextContent(
        "Project 'Billing DB' overrides the yellow threshold to 2 days, so the red threshold can't exceed it.",
      );
    await expect.element(saveButton()).toBeEnabled();
    expect(store.settingsAndLookups.globalSettings).toEqual({
      autoCompleteParents: false,
      urgencyYellowThreshold: daysTicks(3),
      urgencyRedThreshold: hoursTicks(24),
      workspaceCardColumns: 4,
      reminders: DEFAULT_REMINDERS,
      keepRunningInTray: false,
      startWithSystem: false,
      addOpensDetails: { todo: false, ticket: false },
      autoHideCompleted: true,
      urgencyColors: { approaching: null, overdue: null },
      trayCard: { size: "Full", showItems: true },
      showTicketDetailOnCards: true,
      workspaceLayout: DEFAULT_LAYOUT,
    });
    expect(store.settingsAndLookups.reconciledProjects).toEqual([]);
  });

  it("Navigates cleanly when unmodified and asks before discarding unsaved edits", async () => {
    const { store, history } = await openAppSettings();

    await page.getByTestId("sidebar-home").click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();

    await openSettingsFromMenu();
    await expect.element(yellowAmount()).toBeVisible();
    await yellowAmount().fill("5");
    await page.getByTestId("sidebar-home").click();

    const discardDialog = page.getByRole("alertdialog", { name: "Discard unsaved settings?" });
    await expect
      .element(discardDialog)
      .toHaveAccessibleDescription("Your changes to the global defaults haven't been saved.");

    await userEvent.keyboard("{Escape}");

    await expect.element(discardDialog).not.toBeInTheDocument();
    await expect.element(yellowAmount()).toHaveValue("5");
    expect(history.location.pathname).toBe("/settings");

    await page.getByTestId("sidebar-home").click();
    await expect.element(discardDialog).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(history.location.pathname).toBe("/");
    expect(store.settingsAndLookups.globalSettings.urgencyYellowThreshold).toBe(daysTicks(3));
  });

  it("Offers only Discard and Cancel for unsaved defaults, as legacy Back did", async () => {
    const { store, history } = await openAppSettings();
    const discardDialog = page.getByRole("alertdialog", { name: "Discard unsaved settings?" });
    await yellowAmount().fill("5");

    await page.getByTestId("sidebar-home").click();
    await expect.element(discardDialog).toBeVisible();
    expect(discardDialog.getByRole("button").elements()).toHaveLength(2);
    await discardDialog.getByRole("button", { name: "Cancel" }).click();

    await expect.element(discardDialog).not.toBeInTheDocument();
    await expect.element(yellowAmount()).toHaveValue("5");
    expect(history.location.pathname).toBe("/settings");

    await page.getByTestId("sidebar-home").click();
    await discardDialog.getByRole("button", { name: "Discard" }).click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(store.calls).not.toContain("SaveGlobalSettings");
  });

  it("Returns home with Back when opened from Home", async () => {
    const { history } = await openAppSettings();

    await backButton().click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });

  it("Opens from the File menu in a workspace and returns to that project with Back", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Billing DB" }] });
    const projectId = store.summaries[0]!.project.id;
    history.push(`/projects/${projectId}`);
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();

    await openSettingsFromMenu();
    await expect.element(appSettingsHeading()).toBeVisible();
    await backButton().click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Returns to the open project with Back when opened from the File menu in a folder", async () => {
    const { store, history } = await renderApp({
      projects: [{ name: "Billing DB", folders: [{ name: "Tables" }] }],
    });
    const projectId = store.summaries[0]!.project.id;
    history.push(`/projects/${projectId}/folders/${store.folderNamed("Tables").id}`);
    await expect.element(page.getByRole("heading", { level: 1, name: "Tables" })).toBeVisible();

    await openSettingsFromMenu();
    await expect.element(appSettingsHeading()).toBeVisible();
    await backButton().click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Asks before Back discards unsaved defaults", async () => {
    const { history } = await openAppSettings();
    await yellowAmount().fill("5");

    await backButton().click();

    await expect
      .element(page.getByRole("alertdialog", { name: "Discard unsaved settings?" }))
      .toBeVisible();
    expect(history.location.pathname).toBe("/settings");
  });

  it("Asks about unsaved defaults when returning from Trash after a change there", async () => {
    await openAppSettings({
      projects: [{ name: "Billing" }],
      configure(store) {
        store.trash.add(trashBatch(1, store.summaries[0]!.project.id, "Old note"));
      },
    });
    await yellowAmount().fill("5");
    await chooseMenuCommand("view", "menu-trash");
    await page
      .getByRole("article", { name: "Old note" })
      .getByRole("button", { name: "Restore" })
      .click();
    await expect.element(page.getByText("The trash is empty.")).toBeVisible();
    const discardDialog = page.getByRole("alertdialog", { name: "Discard unsaved settings?" });

    await page.getByTestId("trash-back").click();
    await expect.element(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: "Cancel" }).click();
    await expect.element(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
    await page.getByTestId("trash-back").click();
    await discardDialog.getByRole("button", { name: "Discard" }).click();

    await expect.element(appSettingsHeading()).toBeVisible();
    await expect.element(yellowAmount()).toHaveValue("3");
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Steps threshold amounts with ArrowUp and ArrowDown without going below zero", async () => {
    await openAppSettings();

    await yellowAmount().click();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(yellowAmount()).toHaveValue("4");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    await expect.element(yellowAmount()).toHaveValue("0");
    await redAmount().fill("0.5");
    await userEvent.keyboard("{ArrowUp}");

    await expect.element(redAmount()).toHaveValue("1.5");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(redAmount()).toHaveValue("0");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed app settings baseline", async () => {
      await openAppSettings({
        projects: [{ name: "Billing DB" }],
        configure: (appStore) => {
          appStore.settingsAndLookups.addPriorityLevelSeed("Review");
          appStore.settingsAndLookups.addPriorityLevelSeed("Legacy spike", { isArchived: true });
        },
      });

      await matchShellAtBothSizes("app-settings", theme);
    });
  });
});
