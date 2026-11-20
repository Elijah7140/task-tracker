import { describe, expect, it } from "vitest";
import {
  beginLinkEdit,
  cancelLinkEntry,
  currentLinkRows,
  EMPTY_LINK_DRAFT,
  type LinkDraft,
  linkDraftStatus,
  moveLink,
  removeLink,
  setLinkEntry,
  type StoredLink,
  submitLinkEntry,
} from "../../src/editor/link-draft.js";

const FIRST = "019A0000-0000-7000-8000-000000000001";
const SECOND = "019A0000-0000-7000-8000-000000000002";

function stored(...links: ReadonlyArray<readonly [string, string | null]>): StoredLink[] {
  const ids = [FIRST, SECOND];
  return links.map(([url, title], index) => ({ id: ids[index]!, url, title, sortOrder: index }));
}

let keys = 0;
const newKey = () => `new-${++keys}`;

function type(draft: LinkDraft, url: string, title = "") {
  return setLinkEntry(setLinkEntry(draft, "url", url), "title", title);
}

const urls = (list: ReadonlyArray<StoredLink>, draft: LinkDraft) =>
  currentLinkRows(list, draft).map((row) => row.url);

describe("Link drafts", () => {
  it("A new list is not dirty and sends no links", () => {
    const list = stored(["https://a.example", null]);

    const status = linkDraftStatus(list, EMPTY_LINK_DRAFT);

    expect(status).toEqual({ dirty: false, links: undefined, entryProblem: null });
  });

  it("Submitting a valid link adds it trimmed and clears the boxes", () => {
    const list = stored();

    const draft = submitLinkEntry(
      list,
      type(EMPTY_LINK_DRAFT, "  https://example.com/x  ", " Spec "),
      newKey,
    );

    expect(currentLinkRows(list, draft)).toMatchObject([
      { id: null, url: "https://example.com/x", title: "Spec" },
    ]);
    expect([draft.url, draft.title, draft.error]).toEqual(["", "", null]);
    expect(linkDraftStatus(list, draft)).toMatchObject({
      dirty: true,
      links: [{ id: null, url: "https://example.com/x", title: "Spec" }],
    });
  });

  it.each([
    ["", "Enter a link address."],
    ["example.com", "A link must be a full http, https or mailto address."],
    ["file:///C:/secrets.txt", "A link must be a full http, https or mailto address."],
    ["javascript:alert(1)", "A link must be a full http, https or mailto address."],
    ["https://a b.example", "A link address cannot contain spaces; write a space as %20."],
  ])("Submitting %j sets a message and adds nothing", (url, message) => {
    const list = stored();

    const draft = submitLinkEntry(list, type(EMPTY_LINK_DRAFT, url), newKey);

    expect(draft.error).toBe(message);
    expect(urls(list, draft)).toEqual([]);
  });

  it("Removing a link reports the changed list with the kept IDs", () => {
    const list = stored(["https://a.example", null], ["https://b.example", null]);

    const draft = removeLink(list, EMPTY_LINK_DRAFT, FIRST);

    expect(linkDraftStatus(list, draft).links).toEqual([
      { id: SECOND, url: "https://b.example", title: null },
    ]);
  });

  it("Moving links reorders them, the edges do nothing and moving back is clean", () => {
    const list = stored(["https://a.example", null], ["https://b.example", null]);

    const atEdge = moveLink(list, EMPTY_LINK_DRAFT, FIRST, -1);
    const moved = moveLink(list, atEdge, FIRST, 1);
    const back = moveLink(list, moved, FIRST, -1);

    expect(linkDraftStatus(list, atEdge).dirty).toBe(false);
    expect(urls(list, moved)).toEqual(["https://b.example", "https://a.example"]);
    expect(linkDraftStatus(list, moved).dirty).toBe(true);
    expect(linkDraftStatus(list, back).dirty).toBe(false);
  });

  it("Editing a link keeps its ID and replaces its row", () => {
    const list = stored(["https://a.example", "Aye"]);
    const editing = beginLinkEdit(list, EMPTY_LINK_DRAFT, FIRST);

    const updated = submitLinkEntry(
      list,
      setLinkEntry(editing, "url", "https://changed.example"),
      newKey,
    );

    expect([editing.editingKey, editing.url, editing.title]).toEqual([
      FIRST,
      "https://a.example",
      "Aye",
    ]);
    expect(currentLinkRows(list, updated)).toEqual([
      { key: FIRST, id: FIRST, url: "https://changed.example", title: "Aye" },
    ]);
    expect(updated.editingKey).toBeNull();
  });

  it("Cancelling an edit changes nothing", () => {
    const list = stored(["https://a.example", null]);
    const editing = setLinkEntry(
      beginLinkEdit(list, EMPTY_LINK_DRAFT, FIRST),
      "url",
      "https://x.example",
    );

    const cancelled = cancelLinkEntry(editing);

    expect(cancelled.editingKey).toBeNull();
    expect(linkDraftStatus(list, cancelled).dirty).toBe(false);
    expect(urls(list, cancelled)).toEqual(["https://a.example"]);
  });

  it.each([false, true])(
    "Starting another edit keeps pending text until it is cancelled (editing: %s)",
    (editingExisting) => {
      const list = stored(["https://a.example", null], ["https://b.example", "Bee"]);
      const started = editingExisting
        ? beginLinkEdit(list, EMPTY_LINK_DRAFT, FIRST)
        : EMPTY_LINK_DRAFT;
      const pending = type(started, "https://pending.example", "Pending");

      const refused = beginLinkEdit(list, pending, SECOND);
      const retried = beginLinkEdit(list, cancelLinkEntry(refused), SECOND);

      expect(refused.error).toBe("Finish or cancel the link you're editing first.");
      expect(refused.editingKey).toBe(editingExisting ? FIRST : null);
      expect([refused.url, refused.title]).toEqual(["https://pending.example", "Pending"]);
      expect([retried.url, retried.error]).toEqual(["https://b.example", null]);
    },
  );

  it("Text left in the boxes is dirty and saved as an added link", () => {
    const list = stored();

    const status = linkDraftStatus(list, type(EMPTY_LINK_DRAFT, "https://typed.example"));

    expect(status).toEqual({
      dirty: true,
      links: [{ id: null, url: "https://typed.example", title: null }],
      entryProblem: null,
    });
  });

  it("An invalid entry in the boxes is reported without changing the list", () => {
    const list = stored(["https://a.example", null]);

    const status = linkDraftStatus(list, type(EMPTY_LINK_DRAFT, "nonsense"));

    expect(status).toEqual({
      dirty: true,
      links: undefined,
      entryProblem: "A link must be a full http, https or mailto address.",
    });
  });

  it("No more than the maximum number of links can be added", () => {
    const list = stored();
    let draft = EMPTY_LINK_DRAFT;

    for (let count = 0; count <= 100; count++) {
      draft = submitLinkEntry(list, type(draft, `https://example.com/${count}`), newKey);
    }

    expect(currentLinkRows(list, draft)).toHaveLength(100);
    expect(draft.error).toBe("An item may have at most 100 links.");
  });

  it("A stored list loaded after the draft started keeps the typed rows", () => {
    const draft = submitLinkEntry([], type(EMPTY_LINK_DRAFT, "https://typed.example"), newKey);
    const later = stored(["https://other.example", null]);

    const rows = urls(later, draft);

    expect(rows).toEqual(["https://typed.example"]);
  });

  describe("Link drafts trim like .NET", () => {
    it("Treats .NET white space as an empty entry", () => {
      const list = stored(["https://a.example", null]);

      const status = linkDraftStatus(list, type(EMPTY_LINK_DRAFT, "\u0085", "\u2028"));

      expect(status.dirty).toBe(false);
    });

    it("Keeps a byte-order mark in an added title", () => {
      const list = stored();

      const draft = submitLinkEntry(
        list,
        type(EMPTY_LINK_DRAFT, "\u00a0https://b.example\u0085", "\ufeffSpec\u3000"),
        newKey,
      );

      expect(currentLinkRows(list, draft).map((row) => [row.url, row.title])).toEqual([
        ["https://b.example", "\ufeffSpec"],
      ]);
    });
  });
});
