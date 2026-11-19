import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

const manager = () => page.getByTestId("field-manager");
const fieldRow = (name: string) => manager().getByRole("listitem", { name, exact: true });
const typeBox = (name = "Effort") => fieldRow(name).getByTestId("field-type");
const validationDialog = () => page.getByRole("alertdialog", { name: "Field validation" });

async function openSettingsWithTextField(
  inProjectSettings: boolean,
  options: { readonly hasValues?: boolean } = {},
) {
  if (!inProjectSettings) {
    const app = await renderApp({
      path: "/settings",
      configure: (store: FakeProjectStore) => {
        store.customFields.addFieldSeed("Effort", "Text", options);
      },
    });
    await expect.element(typeBox()).toBeVisible();
    return app;
  }

  const app = await renderApp({
    projects: [{ name: "Billing DB" }],
    configure: (store: FakeProjectStore) => {
      const projectId = store.summaries[0]!.project.id;
      store.customFields.addFieldSeed("Effort", "Text", { ...options, projectId });
    },
  });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}/settings`);
  await expect.element(typeBox()).toBeVisible();
  return app;
}

/** Focuses the closed type box and browses one entry down without committing. */
async function focusClosedAndBrowseDown(steps = 1) {
  await typeBox().click();
  await userEvent.keyboard("{Escape}");
  await expect.element(typeBox()).toHaveFocus();
  for (let i = 0; i < steps; i++) {
    await userEvent.keyboard("{ArrowDown}");
  }
}

describe("FieldTypeSelect", () => {
  describe.each([false, true])("inProjectSettings=%s", (inProjectSettings) => {
    it("Pressing down twice on a closed type box applies only the final type", async () => {
      const { store } = await openSettingsWithTextField(inProjectSettings);

      await focusClosedAndBrowseDown(2);

      await expect.element(typeBox()).toHaveTextContent("Date");
      expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
      expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Date");
      expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(1);
      await expect.element(validationDialog()).not.toBeInTheDocument();
    });

    it("Pressing down twice in an open type box applies only the final type", async () => {
      const { store } = await openSettingsWithTextField(inProjectSettings);

      await typeBox().click();
      await expect.element(page.getByRole("option", { name: "Text", exact: true })).toBeVisible();
      await userEvent.keyboard("{ArrowDown}{ArrowDown}");

      expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
      expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Date");
      expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(1);
      await expect.element(validationDialog()).not.toBeInTheDocument();
    });
  });

  it("Typing a letter on a closed type box browses without saving until committed", async () => {
    const { store } = await openSettingsWithTextField(false);
    await typeBox().click();
    await userEvent.keyboard("{Escape}");

    await userEvent.keyboard("d");

    await expect.element(typeBox()).toHaveTextContent("Date");
    expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Date");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(1);
  });

  it("Tab applies a browsed type", async () => {
    const { store } = await openSettingsWithTextField(false);
    await focusClosedAndBrowseDown(1);

    await userEvent.keyboard("{Tab}");

    await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Number");
    await expect.element(typeBox()).toHaveTextContent("Number");
  });

  it("Escape puts the saved type back after browsing", async () => {
    const { store } = await openSettingsWithTextField(false);
    await focusClosedAndBrowseDown(1);
    await expect.element(typeBox()).toHaveTextContent("Number");

    await userEvent.keyboard("{Escape}");

    await expect.element(typeBox()).toHaveTextContent("Text");
    expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);
  });

  it("Escape in a type box reopened after browsing puts the saved type back", async () => {
    const { store } = await openSettingsWithTextField(false);
    await focusClosedAndBrowseDown(1);
    await expect.element(typeBox()).toHaveTextContent("Number");

    await typeBox().click();
    await expect.element(page.getByRole("option", { name: "Number", exact: true })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(typeBox()).toHaveTextContent("Text");
    expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);
  });

  it("Clicking an area that takes no focus applies a browsed type", async () => {
    const { store } = await openSettingsWithTextField(false);
    await focusClosedAndBrowseDown(1);
    await expect.element(typeBox()).toHaveTextContent("Number");

    await fieldRow("Effort").getByText("Effort", { exact: true }).click();

    await expect.poll(() => store.customFields.fieldNamed("Effort").dataType).toBe("Number");
    await expect.element(typeBox()).toHaveTextContent("Number");
  });

  it("Leaving the page with a browsed type saves nothing", async () => {
    const { store, history } = await openSettingsWithTextField(false);
    await focusClosedAndBrowseDown(1);
    await expect.element(typeBox()).toHaveTextContent("Number");

    history.push("/");

    await expect.element(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
    expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);
    await expect.element(validationDialog()).not.toBeInTheDocument();
  });

  it("The wheel over a closed focused type box leaves scrolling to the page and keeps the type", async () => {
    const { store } = await openSettingsWithTextField(false);
    await typeBox().click();
    await userEvent.keyboard("{Escape}");
    await expect.element(typeBox()).toHaveFocus();

    const wheel = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
    const notCanceled = typeBox().element().dispatchEvent(wheel);

    expect(notCanceled).toBe(true);
    expect(wheel.defaultPrevented).toBe(false);
    await expect.element(typeBox()).toHaveFocus();
    await expect.element(typeBox()).toHaveTextContent("Text");
    expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);
  });

  it("A type refused after Tab puts the saved type back and shows one message", async () => {
    const { store } = await openSettingsWithTextField(false, { hasValues: true });
    await focusClosedAndBrowseDown(1);

    await userEvent.keyboard("{Tab}");

    await expect
      .element(validationDialog())
      .toHaveAccessibleDescription("A field with values cannot change type.");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(1);
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(validationDialog()).not.toBeInTheDocument();
    await expect.element(typeBox()).toHaveTextContent("Text");
    expect(store.customFields.fieldNamed("Effort").dataType).toBe("Text");
  });

  it("Browsing the type box of a field with values shows one message only when committed", async () => {
    const { store } = await openSettingsWithTextField(false, { hasValues: true });

    await focusClosedAndBrowseDown(2);

    await expect.element(typeBox()).toHaveTextContent("Date");
    await expect.element(validationDialog()).not.toBeInTheDocument();
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(0);

    await userEvent.keyboard("{Enter}");

    await expect
      .element(validationDialog())
      .toHaveAccessibleDescription("A field with values cannot change type.");
    expect(store.calls.filter((call) => call === "ChangeFieldType")).toHaveLength(1);
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(typeBox()).toHaveTextContent("Text");
  });
});
