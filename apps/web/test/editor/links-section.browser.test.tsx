import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedLink } from "../support/fake-item-links.js";
import {
  EDITOR_ITEM,
  draftDialog,
  editor,
  itemRow,
  openEditor,
  openEditorWorkspace,
} from "../support/item-editor-page.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const links = () => editor().getByRole("region", { name: "Links" });
const rows = () => links().getByTestId("item-editor-link");
const openButtons = () => links().getByTestId("item-editor-link-open");
const openButton = (name: string) => links().getByRole("button", { name, exact: true });
const addressBox = () => links().getByRole("textbox", { name: "Link address" });
const titleBox = () => links().getByRole("textbox", { name: "Link title" });
const submitButton = () => links().getByTestId("item-editor-link-submit");
const cancelButton = () => links().getByTestId("item-editor-link-cancel");
const linkError = () => links().getByTestId("item-editor-link-error");
const saveButton = () => editor().getByTestId("item-editor-save");
const rowAction = (action: "Edit" | "Remove", name: string) =>
  links().getByRole("button", { name: `${action} link ${name}`, exact: true });
const moveAction = (name: string, direction: "up" | "down") =>
  links().getByRole("button", { name: `Move link ${name} ${direction}`, exact: true });

async function openWithLinks(seed: ReadonlyArray<SeedLink> = []) {
  const app = await openEditorWorkspace({
    configure: (store, projectId) => {
      const item = store.findItemByTitle(projectId, null, EDITOR_ITEM);
      if (item === undefined) {
        throw new Error("The editor fixture is missing");
      }
      store.itemLinks.seed(item.item.id, seed);
    },
  });
  await openEditor();
  const storedLinks = () => app.store.itemLinks.linksOf(app.itemId(EDITOR_ITEM));
  const storedUrls = () => storedLinks().map(({ url }) => url);
  return { ...app, storedLinks, storedUrls };
}

async function addLink(url: string, title?: string) {
  await addressBox().fill(url);
  if (title !== undefined) {
    await titleBox().fill(title);
  }
  await submitButton().click();
}

async function saveAndClose() {
  await saveButton().click();
  await expect.element(editor()).not.toBeInTheDocument();
}

const shownNames = () =>
  openButtons()
    .elements()
    .map((element) => element.getAttribute("aria-label"));

describe("Links section", () => {
  it("Lists stored links in order with the address under a title and as a tooltip", async () => {
    await openWithLinks([{ url: "https://a.example", title: "Aye" }, { url: "https://b.example" }]);

    await expect.element(openButton("Aye")).toBeVisible();

    expect(shownNames()).toEqual(["Aye", "https://b.example"]);
    await expect.element(openButton("Aye")).toHaveAttribute("title", "https://a.example");
    expect(rows().nth(0).element().textContent).toContain("https://a.example");
    await expect.element(saveButton()).toBeDisabled();
  });

  it("Adds a link with the pointer and saves it on the item", async () => {
    const app = await openWithLinks();
    await expect.element(links().getByText("No links yet.")).toBeVisible();

    await addLink("https://example.com/spec", "Spec");

    await expect.element(openButton("Spec")).toBeVisible();
    await expect.element(addressBox()).toHaveValue("");
    await saveAndClose();
    expect(app.storedLinks()).toMatchObject([{ url: "https://example.com/spec", title: "Spec" }]);
  });

  it.each([null, "Spec"])(
    "Pressing Enter in either box adds the link (title %j)",
    async (title) => {
      await openWithLinks();
      await addressBox().click();
      await userEvent.keyboard("https://example.com/a");
      if (title !== null) {
        await userEvent.keyboard("{Tab}");
        await expect.element(titleBox()).toHaveFocus();
        await userEvent.keyboard(title);
      }

      await userEvent.keyboard("{Enter}");

      await expect.element(openButton(title ?? "https://example.com/a")).toBeVisible();
      await expect.element(editor()).toBeVisible();
    },
  );

  it("Shows why a file address is refused, marks the box and adds nothing", async () => {
    await openWithLinks();

    await addLink("file:///C:/secrets.txt");

    await expect
      .element(linkError())
      .toHaveTextContent("A link must be a full http, https or mailto address.");
    await expect.element(addressBox()).toHaveAttribute("aria-invalid", "true");
    expect(openButtons().elements()).toHaveLength(0);
  });

  it("Keeps pending text when another link is edited and explains how to continue", async () => {
    await openWithLinks([{ url: "https://existing.example" }]);
    await addressBox().fill("https://pending.example");

    await rowAction("Edit", "https://existing.example").click();

    await expect.element(addressBox()).toHaveValue("https://pending.example");
    await expect
      .element(linkError())
      .toHaveTextContent("Finish or cancel the link you're editing first.");
    await cancelButton().click();
    await rowAction("Edit", "https://existing.example").click();
    await expect.element(addressBox()).toHaveValue("https://existing.example");
    await expect.element(addressBox()).toHaveFocus();
    await expect.element(submitButton()).toHaveTextContent("Update link");
  });

  it("Removes a link and saves the shorter list", async () => {
    const app = await openWithLinks([
      { url: "https://a.example" },
      { url: "https://b.example", title: "Bee" },
    ]);

    await rowAction("Remove", "https://a.example").click();

    await expect.element(openButton("Bee")).toHaveFocus();
    await saveAndClose();
    expect(app.storedUrls()).toEqual(["https://b.example"]);
  });

  it("Reorders links with the move buttons and Alt+Arrow keys and keeps the new order", async () => {
    const app = await openWithLinks([
      { url: "https://a.example" },
      { url: "https://b.example" },
      { url: "https://c.example" },
    ]);
    const ids = app.storedLinks().map(({ id }) => id);

    await expect
      .element(moveAction("https://a.example", "up"))
      .toHaveAttribute("aria-disabled", "true");
    await moveAction("https://a.example", "down").click();
    openButton("https://c.example").element().focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

    expect(shownNames()).toEqual(["https://b.example", "https://c.example", "https://a.example"]);
    await expect.element(openButton("https://c.example")).toHaveFocus();
    await expect
      .element(moveAction("https://b.example", "up"))
      .toHaveAttribute("aria-disabled", "true");
    await saveAndClose();
    expect(app.storedLinks().map(({ id }) => id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("Edits a link with the keyboard and keeps its ID when updated and saved", async () => {
    const app = await openWithLinks([{ url: "https://a.example", title: "Aye" }]);
    const [stored] = app.storedLinks();
    rowAction("Edit", "Aye").element().focus();

    await userEvent.keyboard("{Enter}");
    await expect.element(addressBox()).toHaveFocus();
    await userEvent.keyboard("{Control>}a{/Control}https://changed.example{Enter}");

    await expect.element(openButton("Aye")).toHaveAttribute("title", "https://changed.example");
    await expect.element(submitButton()).toHaveTextContent("Add link");
    await saveAndClose();
    expect(app.storedLinks()).toEqual([{ ...stored, url: "https://changed.example" }]);
  });

  it("Discard changes drops added links and restores removed ones", async () => {
    const app = await openWithLinks([{ url: "https://a.example" }]);
    await rowAction("Remove", "https://a.example").click();
    await addLink("https://new.example");
    await addressBox().fill("https://typed.example");

    await editor().getByTestId("item-editor-discard").click();

    expect(shownNames()).toEqual(["https://a.example"]);
    await expect.element(addressBox()).toHaveValue("");
    await expect.element(saveButton()).toBeDisabled();
    expect(app.storedUrls()).toEqual(["https://a.example"]);
  });

  it("Save adds text left in the boxes", async () => {
    const app = await openWithLinks();
    await addressBox().fill("https://left.example");
    await expect.element(saveButton()).toBeEnabled();

    await saveAndClose();

    expect(app.storedUrls()).toEqual(["https://left.example"]);
  });

  it("Save is refused with a message while the boxes hold an invalid link", async () => {
    const app = await openWithLinks();
    await addressBox().fill("file:///C:/x");

    await saveButton().click();

    await expect
      .element(editor().getByTestId("item-editor-error"))
      .toHaveTextContent("Fix the link marked in red first.");
    await expect
      .element(linkError())
      .toHaveTextContent("A link must be a full http, https or mailto address.");
    expect(app.store.calls).not.toContain("EditItem");
    expect(app.storedUrls()).toEqual([]);
  });

  it("Keeps the draft and shows the server's reason when a save is refused", async () => {
    const app = await openWithLinks();
    app.store.itemLinks.refusal = "An item may have at most 100 links.";
    await addLink("https://a.example");

    await saveButton().click();

    await expect
      .element(editor().getByTestId("item-editor-error"))
      .toHaveTextContent("An item may have at most 100 links.");
    await expect.element(openButton("https://a.example")).toBeVisible();
    expect(app.storedUrls()).toEqual([]);
  });

  it("Opens a listed link with the system handler and reports a failed launch", async () => {
    const openExternalLink = vi.fn(async (address: string) => address.startsWith("mailto:"));
    vi.stubGlobal("taskTrackerDesktop", { openExternalLink });
    try {
      await openWithLinks([
        { url: "mailto:team@example.com", title: "Team" },
        { url: "https://down.example" },
      ]);

      await openButton("Team").click();
      openButton("https://down.example").element().focus();
      await userEvent.keyboard("{Enter}");

      await expect
        .element(page.getByText("The link could not be opened: https://down.example"))
        .toBeVisible();
      expect(openExternalLink.mock.calls).toEqual([
        ["mailto:team@example.com"],
        ["https://down.example"],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("Asks about unsaved link changes before closing and blocks undo meanwhile", async () => {
    const app = await openWithLinks();
    await addLink("https://saved.example");
    await saveAndClose();
    await openEditor();
    await addLink("https://x.example");
    saveButton().element().focus();

    await userEvent.keyboard("{Control>}z{/Control}");
    const blocked = page.getByRole("alertdialog", { name: "Undo and redo" });
    await expect
      .element(blocked)
      .toHaveAccessibleDescription("Save or discard your item edits before undoing or redoing.");
    await blocked.getByRole("button", { name: "OK" }).click();
    await editor().getByTestId("item-editor-close").click();

    await expect.element(draftDialog()).toBeVisible();
    await draftDialog().getByRole("button", { name: "Cancel" }).click();
    await expect.element(openButton("https://x.example")).toBeVisible();
    expect(app.store.calls).not.toContain("ApplyHistory");
  });

  it("Undo and redo of a saved link list reload the editor's links", async () => {
    const app = await openWithLinks([{ url: "https://a.example" }]);
    await rowAction("Remove", "https://a.example").click();
    await addLink("https://b.example", "Bee");
    await saveAndClose();

    await itemRow(EDITOR_ITEM).getByTestId("item-row").first().click();
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.poll(app.storedUrls).toEqual(["https://a.example"]);
    await openEditor();

    await expect.element(openButton("https://a.example")).toBeVisible();
    expect(shownNames()).toEqual(["https://a.example"]);
    await editor().getByTestId("item-editor-cancel").click();
    await userEvent.keyboard("{Control>}y{/Control}");
    await expect.poll(app.storedUrls).toEqual(["https://b.example"]);
  });

  it("Shows a load failure with a retry", async () => {
    const app = await openEditorWorkspace({
      configure: (store) => {
        store.itemLinks.loadFailure = true;
      },
    });
    await openEditor();
    const failure = editor().getByTestId("item-editor-links-load-failure");
    await expect.element(failure).toBeVisible();
    expect(failure.element().textContent).toContain("The operation could not be completed.");
    app.store.itemLinks.seed(app.itemId(EDITOR_ITEM), [{ url: "https://a.example" }]);
    app.store.itemLinks.loadFailure = false;

    await failure.getByRole("button", { name: "Try again" }).click();

    await expect.element(openButton("https://a.example")).toBeVisible();
  });

  it("Finds links saved in the editor with the search page's Links filter", async () => {
    await openWithLinks();
    await addLink("https://wiki.example.com/Schema", "Runbook");
    await saveAndClose();

    await userEvent.keyboard("{Control>}f{/Control}");
    await page.getByRole("button", { name: "Add filter" }).click();
    const filter = page.getByRole("group", { name: "Filter" }).last();
    await filter.getByRole("combobox", { name: "Filter field" }).click();
    await page.getByRole("option", { name: "Links", exact: true }).click();
    await filter.getByRole("textbox", { name: "Links value" }).fill("WIKI");
    await page.getByRole("search").getByRole("button", { name: "Search", exact: true }).click();

    const results = page.getByTestId("search-result-row");
    await expect.element(results.first()).toBeVisible();
    expect(results.first().element().textContent).toMatch(/^Add index to Invoice\.CustomerId/);
    expect(results.elements()).toHaveLength(1);
  });

  it.each(THEMES)("Matches the links baseline in the %s theme", async (theme) => {
    await openWithLinks([
      { url: "https://wiki.example.com/runbook", title: "Index runbook" },
      { url: "https://tracker.example.com/browse/DB-101" },
      { url: "mailto:dba-team@example.com", title: "Ask the DBA team" },
    ]);
    await addLink("ftp://example.com");
    await expect.element(linkError()).toBeVisible();
    links().element().scrollIntoView({ block: "center" });

    await settleTheme(theme);

    await expect.element(page.getByTestId("app-shell")).toMatchScreenshot(`editor-links-${theme}`);
  });
});
