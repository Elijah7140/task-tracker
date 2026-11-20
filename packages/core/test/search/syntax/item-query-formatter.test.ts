import { describe, expect, it } from "vitest";
import { formatItemQuery, type FieldFilter } from "../../../src/index.js";
import { CHOICES, parse } from "./query-syntax-fixture.js";

describe("formatItemQuery", () => {
  it("Writes free text first, then one clause per filter with choice labels", () => {
    const parsed = parse('due<2026-12-01 type:error "deadlock" priority:high');

    const text = formatItemQuery(parsed.text, parsed.filters, CHOICES);

    expect(text).toBe("deadlock due<2026-12-01 type:Error priority:High");
  });

  it.each([
    "deadlock retry",
    'title:"two words" title~dead title!=x',
    "effort:1..5 effort>2.5 effort<10",
    "due:2026-11-01..2026-11-30 due>2026-11-01",
    "priority:high..low priority>medium priority<high",
    'type:"needs review" type!=error',
    "has:ticket no:due is:done",
    "is:open flagged:yes flagged!=no",
    '"http://x" "a\\"b" title:"a..b"',
    '"back\\\\slash" title:"tab\there" title:"σίσυφος"',
  ])("Formats %s stably when parsed and formatted again", (source) => {
    const first = parse(source);
    const firstText = formatItemQuery(first.text, first.filters, CHOICES);

    const second = parse(firstText);
    const secondText = formatItemQuery(second.text, second.filters, CHOICES);

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(secondText).toBe(firstText);
    expect(second.filters).toEqual(first.filters);
    expect(second.text).toBe(first.text);
  });

  it("Writes inclusive comparisons in their exact equivalent form", () => {
    const priority = parse("priority>=high");
    const date = parse("due>=2026-12-01");

    const priorityText = formatItemQuery(null, priority.filters, CHOICES);
    const dateText = formatItemQuery(null, date.filters, CHOICES);

    expect(priorityText).toBe("priority:Critical..High");
    expect(dateText).toBe("due>2026-11-30");
  });

  it("Writes an unknown choice ID with a hash so it can still be read back", () => {
    const id = "0190A1B2-0000-7000-8000-0000000000FF";
    const filter: FieldFilter = {
      fieldKey: "priority",
      operator: "equals",
      value: { kind: "choice", id },
    };

    const text = formatItemQuery(null, [filter], CHOICES);

    expect(text).toBe(`priority:#${id}`);
  });

  it("Writes numbers in the invariant culture without locale separators", () => {
    const filters: ReadonlyArray<FieldFilter> = [
      { fieldKey: "effort", operator: "equals", value: { kind: "number", value: 1234.5 } },
      {
        fieldKey: "effort",
        operator: "between",
        value: { kind: "numberRange", min: -1, max: 1e21 },
      },
    ];

    const text = formatItemQuery(null, filters, CHOICES);
    const reparsed = parse(text);

    expect(text).toBe("effort:1234.5 effort:-1..1e+21");
    expect(reparsed.filters).toEqual(filters);
  });

  it("Quotes free text that looks like syntax", () => {
    const text = formatItemQuery("has:ticket plain", [], CHOICES);

    const reparsed = parse(text);

    expect(text).toBe('"has:ticket" plain');
    expect(reparsed.text).toBe("has:ticket plain");
  });

  it("Writes nothing for blank text and no filters", () => {
    const text = formatItemQuery("   ", [], CHOICES);

    expect(text).toBe("");
  });
});
