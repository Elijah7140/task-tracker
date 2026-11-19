import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  EDITOR_ITEM,
  draftDialog,
  editor,
  openEditor,
  openEditorWorkspace,
} from "../support/item-editor-page.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const docs = "# Plan\n\nRead the [docs](https://example.com/docs) first.";
const tasks = "- [x] done\n- [ ] todo";
const longCode =
  "CREATE INDEX IX_Invoice_CustomerId_With_A_Very_Long_Name_That_Must_Wrap_In_The_Preview";
const descriptionInput = () => editor().getByRole("textbox", { name: "Description" });
const editTab = () => editor().getByRole("tab", { name: "Edit" });
const previewTab = () => editor().getByRole("tab", { name: "Preview" });
const preview = () => editor().getByTestId("item-editor-description-preview");

async function openWithDescription(description: string) {
  const app = await openEditorWorkspace({
    configure: (store, projectId) => {
      const item = store.findItemByTitle(projectId, null, EDITOR_ITEM);
      if (item === undefined) {
        throw new Error("The editor fixture is missing");
      }
      store.patchItem(item.item.id, { description });
    },
  });
  await openEditor();
  return app;
}

describe("Description tabs", () => {
  it("Starts in Edit and switches between the preview and unchanged text with the keyboard", async () => {
    await openWithDescription(docs);
    await expect.element(editTab()).toHaveAttribute("aria-selected", "true");

    await editTab().click();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(previewTab()).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(descriptionInput()).not.toBeInTheDocument();
    await expect.element(preview().getByRole("heading", { name: "Plan" })).toBeVisible();
    await editTab().click();
    await expect.element(preview()).not.toBeInTheDocument();
    await expect.element(descriptionInput()).toHaveValue(docs);
  });

  it("Switching modes keeps a clean draft and a newly selected item starts in Edit", async () => {
    const app = await openWithDescription(docs);

    await previewTab().click();
    await expect.element(editor().getByTestId("item-editor-save")).toBeDisabled();
    await editor().getByRole("button", { name: "Check query plan before/after" }).click();

    await expect.element(editTab()).toHaveAttribute("aria-selected", "true");
    await expect.element(descriptionInput()).toHaveValue("");
    await expect.element(draftDialog()).not.toBeInTheDocument();
    expect(app.store.calls).not.toContain("EditItem");
  });

  it("Previews the current draft and saves its Markdown source unchanged", async () => {
    const app = await openWithDescription(docs);
    const draft = "# A draft\n\n**Details**";
    await descriptionInput().fill(draft);

    await previewTab().click();
    await expect.element(preview().getByRole("heading", { name: "A draft" })).toBeVisible();
    await editor().getByTestId("item-editor-save").click();

    await expect.element(editor()).not.toBeInTheDocument();
    expect(app.store.findItemByTitle(app.projectId, null, EDITOR_ITEM)?.item.description).toBe(
      draft,
    );
  });

  it("Opens allowed links with pointer and keyboard and shows blocked links as text", async () => {
    const openExternalLink = vi.fn(async () => true);
    vi.stubGlobal("taskTrackerDesktop", { openExternalLink });
    try {
      await openWithDescription(
        docs + "\n\n[Team](mailto:team@example.com) [secrets](file:///C:/secrets.txt)",
      );
      await previewTab().click();
      const docsLink = preview().getByRole("button", { name: "docs" });
      const mailLink = preview().getByRole("button", { name: "Team" });

      await docsLink.click();
      await userEvent.keyboard("{Tab}{Enter}");

      await expect.element(mailLink).toHaveFocus();
      await expect.element(docsLink).toHaveAttribute("title", "https://example.com/docs");
      expect(preview().element().textContent).toContain("secrets (file:///C:/secrets.txt)");
      await expect
        .element(preview().getByRole("button", { name: "secrets" }))
        .not.toBeInTheDocument();
      expect(openExternalLink.mock.calls).toEqual([
        ["https://example.com/docs"],
        ["mailto:team@example.com"],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Shows a message when the system cannot open a link", async () => {
    vi.stubGlobal("taskTrackerDesktop", { openExternalLink: async () => false });
    try {
      await openWithDescription(docs);
      await previewTab().click();

      await preview().getByRole("button", { name: "docs" }).click();

      await expect
        .element(page.getByText("The link could not be opened: https://example.com/docs"))
        .toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Keeps task markers read-only and aligned with the first line", async () => {
    await openWithDescription(tasks);
    await previewTab().click();
    const boxes = preview().getByRole("checkbox");
    const done = boxes.nth(0);
    const todo = boxes.nth(1);

    await todo.click({ force: true });

    await expect.element(done).toBeChecked();
    await expect.element(todo).not.toBeChecked();
    await expect.element(todo).toBeDisabled();
    const box = done.element().getBoundingClientRect();
    const firstLine = document.createRange();
    firstLine.selectNodeContents(preview().getByText("done", { exact: true }).element());
    const text = firstLine.getBoundingClientRect();
    expect(Math.abs(box.y + box.height / 2 - (text.y + text.height / 2))).toBeLessThanOrEqual(2);
    await editTab().click();
    await expect.element(descriptionInput()).toHaveValue(tasks);
  });

  it("Wraps long code lines while preserving indentation without horizontal scrolling", async () => {
    await openWithDescription(`\`\`\`sql\n${longCode}\n  ON Invoice (CustomerId);\n\`\`\``);

    await previewTab().click();

    const code = preview().getByText(longCode, { exact: false }).element();
    const block = code.closest("pre");
    if (block === null) {
      throw new Error("Expected a preformatted code block");
    }
    expect(block.scrollWidth).toBe(block.clientWidth);
    expect(block.textContent).toContain("\n  ON Invoice");
    const firstLine = document.createRange();
    const text = code.firstChild;
    if (text === null) {
      throw new Error("Expected visible code text");
    }
    firstLine.setStart(text, 0);
    firstLine.setEnd(text, longCode.length);
    expect(firstLine.getClientRects().length).toBeGreaterThan(1);
  });

  it.each(THEMES)("Matches the Markdown preview baseline in the %s theme", async (theme) => {
    await openWithDescription(
      [
        "### Invoice lookup",
        "Check **index usage** with the [query plan](https://example.com/docs).",
        "- [x] Capture the baseline\n- [ ] Compare timings",
        `\`\`\`sql\n${longCode}\n  ON Invoice (CustomerId);\n\`\`\``,
        "> Record the result before merging.",
      ].join("\n\n"),
    );
    await previewTab().click();
    await expect.element(preview().getByRole("heading")).toBeVisible();

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`editor-markdown-preview-${theme}`);
  });
});

describe("Description label", () => {
  it("Points only at a mounted text box while Preview is shown", async () => {
    await openWithDescription(docs);

    await previewTab().click();

    await expect.element(descriptionInput()).not.toBeInTheDocument();
    const dangling = [...editor().element().querySelectorAll("label[for]")].filter(
      (label) => document.getElementById((label as HTMLLabelElement).htmlFor) === null,
    );
    expect(dangling).toEqual([]);
    await editTab().click();
    await expect.element(descriptionInput()).toBeVisible();
  });
});
