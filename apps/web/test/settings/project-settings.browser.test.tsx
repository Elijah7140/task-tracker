import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { trashBatch } from "../support/fake-trash-handlers.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const TICKS_PER_HOUR = 36_000_000_000n;
const daysTicks = (count: number) => String(BigInt(count) * 24n * TICKS_PER_HOUR);
const MISSING_PROJECT_ID = "0190A1B2-0000-7000-8000-000000000999";

const autoOverride = () => page.getByTestId("project-auto-complete-override");
const autoValue = () => page.getByTestId("project-auto-complete");
const autoSource = () => page.getByTestId("project-auto-complete-source");
const autoReset = () => page.getByTestId("project-auto-complete-reset");
const yellowOverride = () => page.getByTestId("project-yellow-override");
const yellowAmount = () => page.getByTestId("project-yellow-amount");
const yellowSource = () => page.getByTestId("project-yellow-source");
const yellowReset = () => page.getByTestId("project-yellow-reset");
const redOverride = () => page.getByTestId("project-red-override");
const redAmount = () => page.getByTestId("project-red-amount");
const redSource = () => page.getByTestId("project-red-source");
const redReset = () => page.getByTestId("project-red-reset");
const saveButton = () => page.getByTestId("save-project-settings");
const backButton = () => page.getByTestId("project-settings-back");

async function openProjectSettings(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    projects: [{ name: "Billing DB" }],
    ...options,
  });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}/settings`);
  await expect
    .element(page.getByRole("heading", { level: 1, name: "Project Settings" }))
    .toBeVisible();
  return { ...app, projectId };
}

describe("ProjectSettingsPage", () => {
  it("Opens from a project card menu on Home and from the project workspace header", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Billing DB" }] });
    const projectId = store.summaries[0]!.project.id;

    await page
      .getByRole("article", { name: "Billing DB" })
      .getByTestId("project-card-menu")
      .click();
    await page.getByTestId("project-settings").click();

    await expect
      .element(page.getByRole("heading", { level: 1, name: "Project Settings" }))
      .toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}/settings`);

    await backButton().click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();

    await page.getByTestId("workspace-project-settings").click();
    await expect
      .element(page.getByRole("heading", { level: 1, name: "Project Settings" }))
      .toBeVisible();
  });

  it("Accepts lowercase project IDs in the settings route", async () => {
    const { store, history } = await renderApp({ projects: [{ name: "Billing DB" }] });
    const projectId = store.summaries[0]!.project.id;

    history.push(`/projects/${projectId.toLowerCase()}/settings`);

    await expect
      .element(page.getByRole("heading", { level: 1, name: "Project Settings" }))
      .toBeVisible();
    await expect.element(page.getByText("Billing DB").first()).toBeVisible();
  });

  it("Redirects home with a message when opening settings for a missing project", async () => {
    const { history } = await renderApp({
      projects: [{ name: "Billing DB" }],
      path: `/projects/${MISSING_PROJECT_ID}/settings`,
    });

    const message = page.getByRole("alertdialog", { name: "Project unavailable" });

    await expect.element(message).toHaveAccessibleDescription("Project is missing or deleted.");
    expect(history.location.pathname).toBe("/");
  });

  it("Shows inherited global values with disabled controls and no Reset buttons", async () => {
    await openProjectSettings();

    await expect.element(autoOverride()).not.toBeChecked();
    await expect.element(autoValue()).toBeDisabled();
    await expect.element(autoSource()).toHaveTextContent("Inherited from global");
    await expect.element(autoReset()).not.toBeInTheDocument();

    await expect.element(yellowOverride()).not.toBeChecked();
    await expect.element(yellowAmount()).toBeDisabled();
    await expect.element(yellowAmount()).toHaveValue("3");
    await expect.element(yellowSource()).toHaveTextContent("Inherited from global");
    await expect.element(yellowReset()).not.toBeInTheDocument();

    await expect.element(redOverride()).not.toBeChecked();
    await expect.element(redAmount()).toBeDisabled();
    await expect.element(redAmount()).toHaveValue("24");
    await expect.element(redSource()).toHaveTextContent("Inherited from global");
    await expect.element(redReset()).not.toBeInTheDocument();

    await expect.element(saveButton()).toBeDisabled();
  });

  it("Shows overridden values with Project override source and Reset only on overridden rows", async () => {
    await openProjectSettings({
      configure: (appStore) => {
        const projectId = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(projectId, {
          urgencyYellowThreshold: daysTicks(5),
        });
      },
    });

    await expect.element(yellowOverride()).toBeChecked();
    await expect.element(yellowSource()).toHaveTextContent("Project override");
    await expect.element(yellowAmount()).toHaveValue("5");
    await expect.element(yellowAmount()).toBeEnabled();
    await expect.element(yellowReset()).toBeVisible();

    await expect.element(redOverride()).not.toBeChecked();
    await expect.element(redSource()).toHaveTextContent("Inherited from global");
    await expect.element(redReset()).not.toBeInTheDocument();
    await expect.element(autoReset()).not.toBeInTheDocument();
  });

  it("Persists an edited override on Save", async () => {
    const { store, projectId } = await openProjectSettings();

    await yellowOverride().click();
    await yellowAmount().fill("5");
    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    const effective = store.settingsAndLookups.getEffective(projectId);
    expect(effective.urgencyYellowThreshold).toEqual({
      value: daysTicks(5),
      source: "Project",
    });
  });

  it("Reverts the form on Reset to global without persisting until Save clears the override", async () => {
    const { store, projectId } = await openProjectSettings({
      configure: (appStore) => {
        const id = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(id, {
          urgencyYellowThreshold: daysTicks(5),
        });
      },
    });

    await yellowReset().click();

    await expect.element(yellowOverride()).not.toBeChecked();
    await expect.element(yellowAmount()).toHaveValue("3");
    await expect.element(yellowSource()).toHaveTextContent("Inherited from global");
    await expect.element(yellowReset()).not.toBeInTheDocument();
    await expect.element(saveButton()).toBeEnabled();
    expect(store.settingsAndLookups.getEffective(projectId).urgencyYellowThreshold.source).toBe(
      "Project",
    );

    await saveButton().click();

    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.getEffective(projectId).urgencyYellowThreshold.source).toBe(
      "Global",
    );
  });

  it("Clears only its own row on Reset and saves no other unsaved override draft", async () => {
    const { store, projectId } = await openProjectSettings({
      configure: (appStore) => {
        const id = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(id, {
          urgencyYellowThreshold: daysTicks(5),
          urgencyRedThreshold: String(30n * TICKS_PER_HOUR),
        });
      },
    });

    await redAmount().fill("40");
    await autoOverride().click();
    await yellowReset().click();

    await expect.element(yellowOverride()).not.toBeChecked();
    await expect.element(yellowAmount()).toHaveValue("3");
    await expect.element(redOverride()).toBeChecked();
    await expect.element(redAmount()).toHaveValue("40");
    await expect.element(autoOverride()).toBeChecked();
    const effective = store.settingsAndLookups.getEffective(projectId);
    expect(effective.urgencyYellowThreshold).toEqual({ value: daysTicks(5), source: "Project" });
    expect(effective.urgencyRedThreshold).toEqual({
      value: String(30n * TICKS_PER_HOUR),
      source: "Project",
    });
    expect(effective.autoCompleteParents.source).toBe("Global");
  });

  it("Saves nothing when confirmed auto-complete enable fails threshold validation on the server", async () => {
    const { store, projectId } = await openProjectSettings({
      configure: (appStore) => {
        const id = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(id, { autoCompleteParents: false });
        appStore.settingsAndLookups.setDisagreements(id, {
          parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000920"],
        });
      },
    });
    store.settingsAndLookups.setGlobalSettings({ urgencyYellowThreshold: daysTicks(1) });

    await autoValue().click();
    await redOverride().click();
    await redAmount().fill("48");
    await saveButton().click();

    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect.element(dialog).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect
      .element(page.getByTestId("project-settings-error"))
      .toHaveTextContent("Red threshold must be nonnegative and no greater than yellow.");
    await expect.element(saveButton()).toBeEnabled();
    const effective = store.settingsAndLookups.getEffective(projectId);
    expect(effective.autoCompleteParents).toEqual({ value: false, source: "Project" });
    expect(effective.urgencyRedThreshold.source).toBe("Global");
    expect(store.settingsAndLookups.reconciledProjects).toEqual([]);
  });

  it("Disables saving when an override leaves red greater than yellow", async () => {
    const { store, projectId } = await openProjectSettings();

    await redOverride().click();
    await redAmount().fill("100");

    await expect
      .element(page.getByTestId("project-settings-error"))
      .toHaveTextContent("Red threshold must be no greater than yellow.");
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.getEffective(projectId).urgencyRedThreshold.source).toBe(
      "Global",
    );
  });

  it("Prompts for reconciliation when enabling auto-complete override and persists nothing on cancel", async () => {
    const { store, projectId } = await openProjectSettings({
      configure: (appStore) => {
        const id = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(id, { autoCompleteParents: false });
        appStore.settingsAndLookups.setDisagreements(id, {
          parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000901"],
        });
      },
    });

    await autoValue().click();
    await yellowOverride().click();
    await yellowAmount().fill("6");
    await saveButton().click();

    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "Turning this on will complete 0 parents and reopen 1 parents. Continue?",
      );

    await userEvent.keyboard("{Escape}");

    await expect.element(dialog).not.toBeInTheDocument();
    expect(store.calls).not.toContain("SaveProjectSettings");
    expect(store.settingsAndLookups.getEffective(projectId).autoCompleteParents.value).toBe(false);
    expect(store.settingsAndLookups.getEffective(projectId).urgencyYellowThreshold.source).toBe(
      "Global",
    );

    await saveButton().click();
    await expect.element(dialog).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect
      .poll(() => store.settingsAndLookups.getEffective(projectId).autoCompleteParents.value)
      .toBe(true);
    await expect.element(saveButton()).not.toHaveAttribute("aria-busy");
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.getEffective(projectId).autoCompleteParents).toEqual({
      value: true,
      source: "Project",
    });
    expect(store.settingsAndLookups.getEffective(projectId).urgencyYellowThreshold).toEqual({
      value: daysTicks(6),
      source: "Project",
    });
    expect(store.settingsAndLookups.reconciledProjects).toHaveLength(1);
  });

  it("Prompts on Save when resetting a disabled auto-complete override turns it back on", async () => {
    const { store, projectId } = await openProjectSettings({
      configure: (appStore) => {
        const id = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(id, { autoCompleteParents: false });
        appStore.settingsAndLookups.setDisagreements(id, {
          parentIdsToComplete: ["0190A1B2-0000-7000-8000-000000000905"],
        });
      },
    });

    await autoReset().click();
    await saveButton().click();

    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect.element(dialog).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(store.settingsAndLookups.getEffective(projectId).autoCompleteParents.source).toBe(
      "Project",
    );
  });

  it("Re-prompts when project disagreements change before approval", async () => {
    const { store, projectId } = await openProjectSettings({
      configure: (appStore) => {
        const id = appStore.summaries[0]!.project.id;
        appStore.settingsAndLookups.setProjectOverrides(id, { autoCompleteParents: false });
        appStore.settingsAndLookups.setDisagreements(id, {
          parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000910"],
        });
      },
    });

    await autoValue().click();
    await saveButton().click();
    const dialog = page.getByRole("alertdialog", { name: "Turn on auto-complete" });
    await expect.element(dialog).toBeVisible();

    store.settingsAndLookups.setDisagreements(projectId, {
      parentIdsToReopen: ["0190A1B2-0000-7000-8000-000000000911"],
    });
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect
      .element(dialog)
      .toHaveAccessibleDescription(
        "Affected items changed. Turning this on will complete 0 parents and reopen 1 parents. Continue?",
      );

    await page.getByTestId("confirm-dialog-confirm").click();

    await expect.poll(() => store.settingsAndLookups.reconciledProjects.length).toBe(1);
    await expect.element(saveButton()).not.toHaveAttribute("aria-busy");
    await expect.element(saveButton()).toBeDisabled();
    expect(store.settingsAndLookups.reconciledProjects[0]?.reopened).toEqual([
      "0190A1B2-0000-7000-8000-000000000911",
    ]);
  });

  it("Navigates back cleanly when unmodified and prompts before discarding unsaved overrides", async () => {
    const { store, history, projectId } = await openProjectSettings();

    await backButton().click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();

    history.push(`/projects/${projectId}/settings`);
    await expect.element(autoOverride()).toBeVisible();
    await autoOverride().click();
    await backButton().click();

    const discardDialog = page.getByRole("alertdialog", { name: "Discard unsaved settings?" });
    await expect
      .element(discardDialog)
      .toHaveAccessibleDescription("Your changes to this project's settings haven't been saved.");

    await userEvent.keyboard("{Escape}");

    await expect.element(discardDialog).not.toBeInTheDocument();
    await expect.element(autoOverride()).toBeChecked();
    expect(history.location.pathname).toBe(`/projects/${projectId}/settings`);

    await backButton().click();
    await expect.element(discardDialog).toBeVisible();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
    expect(store.settingsAndLookups.getEffective(projectId).autoCompleteParents.source).toBe(
      "Global",
    );
  });

  it("Asks about unsaved overrides when returning from Trash after a change there", async () => {
    await openProjectSettings({
      configure(store) {
        store.trash.add(trashBatch(1, store.summaries[0]!.project.id, "Old note"));
      },
    });
    await autoOverride().click();
    await page.getByTestId("sidebar-trash").click();
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

    await expect
      .element(page.getByRole("heading", { level: 1, name: "Project Settings" }))
      .toBeVisible();
    await expect.element(autoOverride()).not.toBeChecked();
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Offers only Discard and Cancel for unsaved overrides, as legacy Back did", async () => {
    const { store, history, projectId } = await openProjectSettings();
    const discardDialog = page.getByRole("alertdialog", { name: "Discard unsaved settings?" });
    await autoOverride().click();

    await backButton().click();
    await expect.element(discardDialog).toBeVisible();
    expect(discardDialog.getByRole("button").elements()).toHaveLength(2);
    await discardDialog.getByRole("button", { name: "Cancel" }).click();

    await expect.element(discardDialog).not.toBeInTheDocument();
    await expect.element(autoOverride()).toBeChecked();
    expect(history.location.pathname).toBe(`/projects/${projectId}/settings`);

    await backButton().click();
    await discardDialog.getByRole("button", { name: "Discard" }).click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(store.calls).not.toContain("SaveProjectSettings");
  });

  it("Steps an overridden threshold with arrow keys and stops at zero", async () => {
    await openProjectSettings();
    await yellowOverride().click();

    await yellowAmount().click();
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(yellowAmount()).toHaveValue("4");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");

    await expect.element(yellowAmount()).toHaveValue("0");
  });

  it("Returns home without the discard prompt when the project is deleted while edits are unsaved", async () => {
    const { store, history, projectId } = await openProjectSettings({
      projects: [{ name: "Billing DB" }, { name: "Payroll" }],
    });
    await yellowOverride().click();
    await yellowAmount().fill("5");

    store.remove(projectId);
    await page.getByTestId("sidebar-new-project").click();
    await userEvent.keyboard("Reporting{Enter}");

    const message = page.getByRole("alertdialog", { name: "Project unavailable" });
    await expect.element(message).toHaveAccessibleDescription("Project is missing or deleted.");
    await expect
      .element(page.getByRole("alertdialog", { name: "Discard unsaved settings?" }))
      .not.toBeInTheDocument();
    expect(history.location.pathname).toBe("/");
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed project settings baseline", async () => {
      await openProjectSettings({
        configure: (appStore) => {
          const id = appStore.summaries[0]!.project.id;
          appStore.settingsAndLookups.setProjectOverrides(id, {
            urgencyYellowThreshold: daysTicks(5),
          });
        },
      });
      await expect.element(page.getByText("No global fields.")).toBeVisible();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`project-settings-${theme}`);
    });
  });
});
