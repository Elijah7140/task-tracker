import { describe, expect, it } from "@effect/vitest";
import { type ItemLink, LinkPolicy, planItemLinkEdits } from "../../src/index.js";

const now = Temporal.Instant.from("2026-11-13T12:00:00Z");
const earlier = Temporal.Instant.from("2026-11-12T08:00:00Z");

function ids() {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `NEW-${sequence}`;
  };
}

function stored(...urls: ReadonlyArray<string>): ReadonlyArray<ItemLink> {
  return urls.map((url, index) => ({
    id: `OLD-${index + 1}`,
    itemId: "ITEM",
    url,
    title: null,
    sortOrder: index,
    createdAtUtc: earlier,
  }));
}

const input = (url: string, title: string | null = null, id: string | null = null) => ({
  id,
  url,
  title,
});

describe("planItemLinkEdits", () => {
  it("Adds new links in list order with trimmed values and fresh IDs", () => {
    const plan = planItemLinkEdits(
      "ITEM",
      [],
      [input("  https://a.example  ", " Aye "), input("mailto:team@example.com", "  ")],
      now,
      ids(),
    );

    expect(plan).toEqual({
      inserts: [
        {
          id: "NEW-1",
          itemId: "ITEM",
          url: "https://a.example",
          title: "Aye",
          sortOrder: 0,
          createdAtUtc: now,
        },
        {
          id: "NEW-2",
          itemId: "ITEM",
          url: "mailto:team@example.com",
          title: null,
          sortOrder: 1,
          createdAtUtc: now,
        },
      ],
      updates: [],
      removals: [],
    });
  });

  it("Updates, removes, adds and renumbers by link ID", () => {
    const existing = stored("https://a.example", "https://b.example", "https://c.example");

    const plan = planItemLinkEdits(
      "ITEM",
      existing,
      [
        input("https://c.example", "Sea", "OLD-3"),
        input("https://d.example"),
        input("https://a2.example", null, "OLD-1"),
      ],
      now,
      ids(),
    );

    expect(plan.removals).toEqual(["OLD-2"]);
    expect(plan.inserts).toMatchObject([{ id: "NEW-1", url: "https://d.example", sortOrder: 1 }]);
    expect(plan.updates).toEqual([
      { ...existing[2], title: "Sea", sortOrder: 0 },
      { ...existing[0], url: "https://a2.example", sortOrder: 2 },
    ]);
  });

  it("Plans nothing when the list is unchanged", () => {
    const existing = stored("https://a.example", "https://b.example");

    const plan = planItemLinkEdits(
      "ITEM",
      existing,
      [input(" https://a.example ", "", "OLD-1"), input("https://b.example", null, "OLD-2")],
      now,
      ids(),
    );

    expect(plan).toEqual({ inserts: [], updates: [], removals: [] });
  });

  it("Removes every link for an empty list", () => {
    const plan = planItemLinkEdits("ITEM", stored("https://a.example"), [], now, ids());

    expect(plan.removals).toEqual(["OLD-1"]);
  });

  it("Treats an unknown link ID as a new link", () => {
    const plan = planItemLinkEdits(
      "ITEM",
      [],
      [input("https://a.example", null, "OTHER")],
      now,
      ids(),
    );

    expect(plan.inserts).toMatchObject([{ id: "NEW-1" }]);
  });

  it.each(["", "example.com", "file:///C:/secrets.txt", "https://", "https://a b.example"])(
    "Rejects the whole list when %j is invalid",
    (url) => {
      const run = () =>
        planItemLinkEdits("ITEM", [], [input("https://new.example"), input(url)], now, ids());

      expect(run).toThrow(LinkPolicy.validate(url, null) ?? "valid");
    },
  );

  it("Rejects more than the link limit and repeated link IDs", () => {
    const tooMany = Array.from({ length: LinkPolicy.MAX_LINKS_PER_ITEM + 1 }, (_, index) =>
      input(`https://e.example/${index}`),
    );
    const repeated = [
      input("https://a.example", null, "OLD-1"),
      input("https://b.example", null, "OLD-1"),
    ];

    const overLimit = () => planItemLinkEdits("ITEM", [], tooMany, now, ids());
    const duplicate = () =>
      planItemLinkEdits("ITEM", stored("https://a.example"), repeated, now, ids());

    expect(overLimit).toThrow("An item may have at most 100 links.");
    expect(duplicate).toThrow("Each link may appear only once.");
  });
});
