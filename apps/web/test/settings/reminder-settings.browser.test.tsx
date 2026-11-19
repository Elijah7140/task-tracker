import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const TICKS_PER_MINUTE = 600_000_000n;
const minutes = (count: number) => String(BigInt(count) * TICKS_PER_MINUTE);

const globalCard = () => page.getByTestId("global-defaults-card");
const globalOffset = () => globalCard().getByRole("combobox", { name: "Default reminder" });
const globalTime = () => page.getByTestId("global-reminder-time");
const globalEnabled = () => page.getByTestId("global-reminders-enabled");
const saveGlobal = () => page.getByTestId("save-global-settings");
const projectCard = () => page.getByTestId("project-overrides-card");
const projectOffset = () => projectCard().getByRole("combobox", { name: "Default reminder" });
const projectTime = () => page.getByTestId("project-reminder-time");
const saveProject = () => page.getByTestId("save-project-settings");

async function chooseOption(name: string) {
  await page.getByRole("option", { name, exact: true }).click();
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
}

type Configure = (store: FakeProjectStore) => void;

async function openAppSettings(configure?: Configure) {
  const app = await renderApp(configure === undefined ? {} : { configure });
  await page.getByRole("navigation", { name: "Main" }).getByTestId("sidebar-settings").click();
  await expect.element(page.getByRole("heading", { level: 1, name: "App Settings" })).toBeVisible();
  return app;
}

async function openProjectSettings(configure?: Configure) {
  const app = await renderApp({
    projects: [{ name: "Billing DB" }],
    ...(configure === undefined ? {} : { configure }),
  });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}/settings`);
  await expect
    .element(page.getByRole("heading", { level: 1, name: "Project Settings" }))
    .toBeVisible();
  return { ...app, projectId };
}

describe("Reminder defaults in App Settings", () => {
  it("Saves the offset and time chosen in the form", async () => {
    const { store } = await openAppSettings();
    await expect.element(globalOffset()).toHaveTextContent("1 hour before");
    await expect.element(globalTime()).toHaveValue("09:00");

    await globalOffset().click();
    await chooseOption("15 minutes before");
    await globalTime().fill("10:00");
    await saveGlobal().click();

    await expect.element(saveGlobal()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.reminders).toEqual({
      remindersEnabled: true,
      defaultReminderOffset: minutes(15),
      dateOnlyReminderTime: "10:00:00",
    });
  });

  it("Keeps an unlisted offset and a time with seconds when other settings save", async () => {
    const { store } = await openAppSettings((fake) =>
      fake.settingsAndLookups.setGlobalSettings({
        reminders: {
          remindersEnabled: true,
          defaultReminderOffset: minutes(45),
          dateOnlyReminderTime: "09:00:17",
        },
      }),
    );
    await expect.element(globalOffset()).toHaveTextContent("45 minutes before");
    await expect.element(globalTime()).toHaveValue("09:00:17");

    await page.getByTestId("global-auto-complete").click();
    await saveGlobal().click();

    await expect.element(saveGlobal()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.reminders).toEqual({
      remindersEnabled: true,
      defaultReminderOffset: minutes(45),
      dateOnlyReminderTime: "09:00:17",
    });
  });

  it("Turns reminders off with the keyboard and refuses an empty time", async () => {
    const { store } = await openAppSettings();

    await globalEnabled().click();
    await globalTime().fill("");

    await expect
      .element(page.getByTestId("global-settings-error"))
      .toHaveTextContent("Choose the date-only reminder time.");
    await expect.element(saveGlobal()).toBeDisabled();
    await globalTime().fill("08:30");
    await saveGlobal().click();
    await expect.element(saveGlobal()).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.reminders?.remindersEnabled).toBe(false);
    expect(store.settingsAndLookups.globalSettings.reminders?.dateOnlyReminderTime).toBe(
      "08:30:00",
    );
  });

  it.each(THEMES)("Matches the global reminder defaults baseline in %s", async (theme) => {
    await openAppSettings();

    await settleTheme(theme);

    await expect.element(globalCard()).toMatchScreenshot(`reminder-settings-global-${theme}`);
  });
});

describe("Reminder overrides in Project Settings", () => {
  it("Saves overrides chosen in the form and reports their source", async () => {
    const { store, projectId } = await openProjectSettings();
    await expect.element(projectOffset()).toBeDisabled();
    await expect.element(projectTime()).toBeDisabled();

    await page.getByTestId("project-reminder-offset-override").click();
    await page.getByTestId("project-reminder-time-override").click();
    await projectOffset().click();
    await chooseOption("2 days before");
    await projectTime().fill("10:00");
    await saveProject().click();

    await expect.element(saveProject()).toBeDisabled();
    await expect
      .element(page.getByTestId("project-reminder-offset-source"))
      .toHaveTextContent("Project override");
    const effective = store.settingsAndLookups.getEffective(projectId).reminders;
    expect(effective?.defaultReminderOffset).toEqual({ value: minutes(2880), source: "Project" });
    expect(effective?.dateOnlyReminderTime).toEqual({ value: "10:00:00", source: "Project" });
    expect(effective?.remindersEnabled.source).toBe("Global");
  });

  it("Reset restores the unlisted global offset and time, then saving clears the overrides", async () => {
    const { store, projectId } = await openProjectSettings((fake) => {
      fake.settingsAndLookups.setGlobalSettings({
        reminders: {
          remindersEnabled: true,
          defaultReminderOffset: minutes(45),
          dateOnlyReminderTime: "08:30:00",
        },
      });
      fake.settingsAndLookups.setProjectOverrides(fake.summaries[0]!.project.id, {
        reminders: {
          remindersEnabled: null,
          defaultReminderOffset: minutes(90),
          dateOnlyReminderTime: "10:30:00",
        },
      });
    });
    await expect.element(projectOffset()).toHaveTextContent("90 minutes before");

    await page.getByTestId("project-reminder-offset-reset").click();
    await page.getByTestId("project-reminder-time-reset").click();

    await expect.element(projectOffset()).toHaveTextContent("45 minutes before");
    await expect.element(projectTime()).toHaveValue("08:30");
    await expect
      .element(page.getByTestId("project-reminder-time-source"))
      .toHaveTextContent("Inherited from global");
    await saveProject().click();
    await expect.element(saveProject()).toBeDisabled();
    const effective = store.settingsAndLookups.getEffective(projectId).reminders;
    expect(effective?.defaultReminderOffset).toEqual({ value: minutes(45), source: "Global" });
  });

  it("Turns reminders off for one project with the keyboard", async () => {
    const { store, projectId } = await openProjectSettings();
    await page.getByTestId("project-reminders-override").click();
    await expect.element(page.getByTestId("project-reminders-override")).toHaveFocus();

    await userEvent.keyboard("{Tab}{ }");

    await expect.element(page.getByTestId("project-reminders-enabled")).not.toBeChecked();
    await saveProject().click();
    await expect.element(saveProject()).toBeDisabled();
    expect(store.settingsAndLookups.getEffective(projectId).reminders?.remindersEnabled).toEqual({
      value: false,
      source: "Project",
    });
  });

  it.each(THEMES)("Matches the project reminder overrides baseline in %s", async (theme) => {
    await openProjectSettings();

    await settleTheme(theme);

    await expect.element(projectCard()).toMatchScreenshot(`reminder-settings-project-${theme}`);
  });
});
