import { describe, expect, it } from "vitest";
import { useThemeStore } from "../../src/state/theme-store.js";
import {
  EDITOR_ITEM,
  editor,
  itemRow,
  openEditor,
  openEditorWorkspace,
} from "../support/item-editor-page.js";
import { THEMES } from "../support/screenshots.js";

const button = () => editor().getByTestId("item-editor-current-item");

describe("editor heading button", () => {
  it("Set as current makes the open item current and marks its card", async () => {
    const { store, itemId } = await openEditorWorkspace();
    await openEditor();
    await expect.element(button()).toHaveTextContent("Set as current");

    await button().click();

    await expect.element(button()).toHaveTextContent("Current item");
    await expect.element(button()).toHaveAttribute("aria-pressed", "true");
    expect(store.currentItem.itemId).toBe(itemId(EDITOR_ITEM));
    await editor().getByTestId("item-editor-close").click();
    await expect
      .element(itemRow(EDITOR_ITEM).getByTestId("item-card-current").first())
      .toHaveAttribute("aria-pressed", "true");
  });

  it("Clicking Current item clears the choice", async () => {
    const { store, itemId } = await openEditorWorkspace({
      configure: (fake, projectId) => {
        fake.currentItem.itemId = fake.findItemByTitle(projectId, null, EDITOR_ITEM)!.item.id;
      },
    });
    await openEditor();
    await expect.element(button()).toHaveTextContent("Current item");

    await button().click();

    await expect.element(button()).toHaveTextContent("Set as current");
    expect(store.currentItem.itemId).toBeNull();
    expect(itemId(EDITOR_ITEM)).not.toBe("");
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  it("The editor heading with the current item matches the baseline", async () => {
    await openEditorWorkspace({
      configure: (fake, projectId) => {
        fake.currentItem.itemId = fake.findItemByTitle(projectId, null, EDITOR_ITEM)!.item.id;
      },
    });
    await openEditor();
    await expect.element(button()).toHaveTextContent("Current item");

    useThemeStore.setState({ preference: theme });
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    await expect
      .element(editor().getByRole("banner"))
      .toMatchScreenshot(`editor-current-item-${theme}`);
  });
});
