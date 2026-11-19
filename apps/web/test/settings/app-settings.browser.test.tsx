import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const TICKS_PER_HOUR = 36_000_000_000n;
const daysTicks = (count: number) => String(BigInt(count) * 24n * TICKS_PER_HOUR);
const hoursTicks = (count: number) => String(BigInt(count) * TICKS_PER_HOUR);

const sidebarSettings = () =>
  page.getByRole("navigation", { name: "Main" }).getByTestId("sidebar-settings");
const autoCompleteBox = () => page.getByTestId("global-auto-complete");
const yellowAmount = () => page.getByTestId("global-yellow-amount");
const yellowUnit = () => page.getByTestId("global-yellow-unit");
const redAmount = () => page.getByTestId("global-red-amount");
const redUnit = () => page.getByTestId("global-red-unit");
const saveButton = () => page.getByTestId("save-global-settings");
const backButton = () => page.getByTestId("app-settings-back");
const appSettingsHeading = () => page.getByRole("heading", { level: 1, name: "App Settings" });

async function openAppSettings(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp(options);
  await sidebarSettings().click();
  await expect.element(page.getByRole("heading", { level: 1, name: "App Settings" })).toBeVisible();
  return app;
}

describe("AppSettingsPage", () => {
  it("Opens from the sidebar Settings link and marks it as the current page", async () => {
    const { history } = await openAppSettings();

    await expect.element(sidebarSettings()).toHaveAttribute("aria-current", "page");
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
    });
  });

  it("Navigates cleanly when unmodified and asks before discarding unsaved edits", async () => {
    const { store, history } = await openAppSettings();

    await page.getByTestId("sidebar-home").click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();

    await sidebarSettings().click();
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

  it("Returns home with Back when opened from Home", async () => {
    const { history } = await openAppSettings();

    await backButton().click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });

  it("Opens from the workspace header and returns to that project with Back", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Billing DB" }] });
    const projectId = store.summaries[0]!.project.id;
    history.push(`/projects/${projectId}`);
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();

    await page.getByTestId("workspace-app-settings").click();
    await expect.element(appSettingsHeading()).toBeVisible();
    await backButton().click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Returns to the open project with Back when opened from the sidebar in a folder", async () => {
    const { store, history } = await renderApp({
      projects: [{ name: "Billing DB", folders: [{ name: "Tables" }] }],
    });
    const projectId = store.summaries[0]!.project.id;
    history.push(`/projects/${projectId}/folders/${store.folderNamed("Tables").id}`);
    await expect.element(page.getByRole("heading", { level: 1, name: "Tables" })).toBeVisible();

    await sidebarSettings().click();
    await expect.element(appSettingsHeading()).toBeVisible();
    await expect.element(sidebarSettings()).toHaveAttribute("aria-current", "page");
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
          appStore.settingsAndLookups.addItemTypeSeed("Review");
          appStore.settingsAndLookups.addItemTypeSeed("Legacy spike", { isArchived: true });
        },
      });

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`app-settings-${theme}`);
    });
  });
});
