import { describe, expect, it } from "vitest";
import {
  describeQueryParseError,
  formatItemQuery,
  queryClauseKeys,
  type FieldFilter,
  type SearchableField,
} from "../../../src/index.js";
import {
  CHOICES,
  choice,
  CRITICAL,
  ERROR_TYPE,
  HIGH,
  LOW,
  MEDIUM,
  NEEDS_REVIEW,
  parse,
  SEARCH_FIELDS,
  withChoices,
} from "./query-syntax-fixture.js";

const builtIn = (key: string, displayName: string, dataType: SearchableField["dataType"]) =>
  ({
    key,
    displayName,
    dataType,
    fieldDefinitionId: null,
    source: { kind: "builtIn", column: key },
  }) satisfies SearchableField;

const single = (text: string) => {
  const result = parse(text);
  expect(result.errors).toEqual([]);
  expect(result.filters).toHaveLength(1);
  return result.filters[0]!;
};

const onlyError = (text: string) => {
  const result = parse(text);
  expect(result.errors).toHaveLength(1);
  return result.errors[0]!;
};

describe("parseItemQuery words and clauses", () => {
  it("Turns plain words and quoted phrases into free text", () => {
    const result = parse('deadlock "in the billing job" retry');

    expect(result.errors).toEqual([]);
    expect(result.text).toBe("deadlock in the billing job retry");
    expect(result.filters).toEqual([]);
  });

  it("Parses empty text to no text and no filters", () => {
    const result = parse("   ");

    expect(result.errors).toEqual([]);
    expect(result.text).toBeNull();
    expect(result.filters).toEqual([]);
  });

  it("Reads a colon as Equals for text", () => {
    const filter = single("ticket:JIRA-12");

    expect(filter).toEqual({
      fieldKey: "ticket",
      operator: "equals",
      value: { kind: "text", value: "JIRA-12" },
    });
  });

  it("Lets quoted values hold spaces and escaped quotes", () => {
    const filter = single('title:"say \\"hi\\" now"');

    expect(filter.value).toEqual({ kind: "text", value: 'say "hi" now' });
  });

  it("Matches keys without regard to case", () => {
    const filter = single("TYPE:error");

    expect(filter.fieldKey).toBe("type");
  });

  it.each([
    ["title!=draft", "notEquals"],
    ["title~dead", "contains"],
    ["effort>3", "greaterThan"],
    ["effort<3", "lessThan"],
  ] as const)("Maps the operator in %s to %s", (text, operator) => {
    const filter = single(text);

    expect(filter.operator).toBe(operator);
  });

  it("Keeps a bare has, no or is word as free text", () => {
    const result = parse("has no is");

    expect(result.errors).toEqual([]);
    expect(result.text).toBe("has no is");
  });

  it("Requires a colon word that is not a field to be quoted before it is text", () => {
    const unquoted = parse("http://example");

    const quoted = parse('"http://example"');

    expect(unquoted.errors).toHaveLength(1);
    expect(quoted.text).toBe("http://example");
  });

  it("Parses the full example from the plan into text and three filters", () => {
    const result = parse('type:error priority>=high due<2026-12-01 "deadlock"');

    expect(result.text).toBe("deadlock");
    expect(result.filters.map((filter) => filter.fieldKey)).toEqual(["type", "priority", "due"]);
  });
});

describe("parseItemQuery values", () => {
  it("Reads numbers with the invariant culture", () => {
    const filter = single("effort:2.5");

    expect(filter.value).toEqual({ kind: "number", value: 2.5 });
  });

  it("Rejects a decimal comma as not a number", () => {
    const error = onlyError("effort:2,5");

    expect(error.message).toBe("'2,5' is not a number. Write decimals with a dot, like 2.5.");
  });

  it.each(["+3", "-1.5e2", ".5", "5."])("Accepts the invariant number %s", (text) => {
    const filter = single(`effort:${text}`);

    expect(filter.value).toEqual({ kind: "number", value: Number(text) });
  });

  it.each(["1e400", "Infinity", "0x10", "1_000"])("Rejects %s as not a finite number", (text) => {
    const error = onlyError(`effort:${text}`);

    expect(error.message).toContain("is not a number");
  });

  it.each([
    ["yes", true],
    ["TRUE", true],
    ["no", false],
    ["false", false],
  ] as const)("Reads the boolean %s", (word, expected) => {
    const filter = single(`flagged:${word}`);

    expect(filter.value).toEqual({ kind: "boolean", value: expected });
  });

  it("Explains a boolean that is not yes or no", () => {
    const error = onlyError("flagged:maybe");

    expect(error.message).toBe("'maybe' is not yes or no.");
  });

  it("Reports a missing value", () => {
    const result = parse("title: due:today");

    expect(result.errors.map((error) => error.message)).toEqual(["A value is needed here."]);
  });
});

describe("parseItemQuery choices", () => {
  it("Resolves choices by label without regard to case", () => {
    const result = parse('priority:high type:"needs REVIEW"');

    expect(result.filters.map((filter) => filter.value)).toEqual([
      { kind: "choice", id: HIGH },
      { kind: "choice", id: NEEDS_REVIEW },
    ]);
  });

  it("Folds choice labels with the search text rules for sigma and ß", () => {
    const choices = withChoices("type", [
      choice(ERROR_TYPE, "ΟΔΟΣ", 0),
      choice(NEEDS_REVIEW, "Straße", 1),
    ]);

    const sigma = parse("type:οδος", { choicesByFieldKey: choices });
    const sharp = parse("type:STRAßE", { choicesByFieldKey: choices });
    const expanded = parse("type:strasse", { choicesByFieldKey: choices });

    expect(sigma.filters[0]?.value).toEqual({ kind: "choice", id: ERROR_TYPE });
    expect(sharp.filters[0]?.value).toEqual({ kind: "choice", id: NEEDS_REVIEW });
    expect(expanded.errors).toHaveLength(1);
  });

  it("Resolves a choice by its ID when written with a hash", () => {
    const filter = single(`priority:#${MEDIUM.toLowerCase()}`);

    expect(filter.value).toEqual({ kind: "choice", id: MEDIUM });
  });

  it("Resolves a quoted ID-shaped label by label and round-trips it", () => {
    const label = `#${MEDIUM}`;
    const choices = withChoices(
      "priority",
      CHOICES.get("priority")!.map((option) =>
        option.id === HIGH ? { ...option, label, name: label } : option,
      ),
    );

    const parsed = parse(`priority:"${label}"`, { choicesByFieldKey: choices });
    const reparsed = parse(parsed.displayText, { choicesByFieldKey: choices });
    const formatted = formatItemQuery(null, parsed.filters, choices);

    expect(parsed.filters[0]?.value).toEqual({ kind: "choice", id: HIGH });
    expect(parsed.displayText).toBe(`priority:"${label}"`);
    expect(formatted).toBe(parsed.displayText);
    expect(reparsed.filters).toEqual(parsed.filters);
  });

  it("Reports a choice ID that no longer exists", () => {
    const error = onlyError("priority:#0190A1B2-0000-7000-8000-0000000000FF");

    expect(error.message).toBe("That Priority choice no longer exists.");
  });

  it("Lists the choices for an unknown choice label", () => {
    const error = onlyError("priority:urgent");

    expect(error.message).toBe(
      "'urgent' is not a Priority choice. Choose one of: Critical, High, Medium, Low.",
    );
  });

  it("Binds an unquoted priority number before a level named like it", () => {
    const choices = withChoices("priority", [
      { ...choice(CRITICAL, "1 · Critical", 0), name: "Critical", number: 1 },
      { ...choice(HIGH, "7 · High", 1), name: "High", number: 7 },
      { ...choice(MEDIUM, "7", 2), name: "7", number: null },
    ]);

    const number = parse("priority:7", { choicesByFieldKey: choices });
    const quoted = parse('priority:"7"', { choicesByFieldKey: choices });
    const named = parse("priority:high", { choicesByFieldKey: choices });

    expect(number.filters[0]?.value).toEqual({ kind: "choice", id: HIGH });
    expect(number.displayText).toBe("priority:7");
    expect(quoted.filters[0]?.value).toEqual({ kind: "choice", id: MEDIUM });
    expect(quoted.displayText).toBe('priority:"7"');
    expect(named.filters[0]?.value).toEqual({ kind: "choice", id: HIGH });
    expect(named.displayText).toBe("priority:7");
  });

  it("Reads priority greater than as more important", () => {
    const filter = single("priority>high");

    expect(filter).toEqual({
      fieldKey: "priority",
      operator: "greaterThan",
      value: { kind: "choice", id: HIGH },
    });
  });

  it("Reads priority at least high as the range from the top level to High", () => {
    const filter = single("priority>=high");

    expect(filter).toEqual({
      fieldKey: "priority",
      operator: "between",
      value: { kind: "choiceRange", min: CRITICAL, max: HIGH },
    });
  });

  it("Reads priority at most high as the range from High to the bottom level", () => {
    const filter = single("priority<=high");

    expect(filter.value).toEqual({ kind: "choiceRange", min: HIGH, max: LOW });
  });

  it("Runs a priority range from more important to less important", () => {
    const forward = single("priority:high..low");

    const backward = onlyError("priority:low..high");

    expect(forward.value).toEqual({ kind: "choiceRange", min: HIGH, max: LOW });
    expect(backward.message).toBe("Put the more important choice first, like priority:high..low.");
  });
});

describe("parseItemQuery dates", () => {
  it("Accepts ISO dates", () => {
    const filter = single("due<2026-12-01");

    expect(filter).toEqual({
      fieldKey: "due",
      operator: "lessThan",
      value: { kind: "date", value: "2026-12-01" },
    });
  });

  it.each([
    ["today", "2026-11-13"],
    ["tomorrow", "2026-11-14"],
    ["yesterday", "2026-11-12"],
    ["+3d", "2026-11-16"],
    ["-1w", "2026-11-06"],
    ["+0d", "2026-11-13"],
    ["TODAY", "2026-11-13"],
    ["+2W", "2026-11-27"],
  ])("Resolves the relative date %s", (word, expected) => {
    const filter = single(`due:${word}`);

    expect(filter.value).toEqual({ kind: "date", value: expected });
  });

  it("Resolves relative dates in the zone passed in", () => {
    const now = Temporal.Instant.from("2026-11-13T20:00:00Z");

    const sydney = parse("due:today", { now, timeZone: "Australia/Sydney" });
    const newYork = parse("due:today", {
      now: Temporal.Instant.from("2026-11-14T02:00:00Z"),
      timeZone: "America/New_York",
    });

    expect(sydney.filters[0]?.value).toEqual({ kind: "date", value: "2026-11-14" });
    expect(newYork.filters[0]?.value).toEqual({ kind: "date", value: "2026-11-13" });
  });

  it.each(["soon", "2026-02-30", "2026-1-05", "+3m", "+5001d", "+d", "0000-01-01"])(
    "Explains the accepted date spellings for %s",
    (word) => {
      const error = onlyError(`due:${word}`);

      expect(error.message).toBe(
        `'${word}' is not a date. Use yyyy-MM-dd, today, tomorrow, yesterday, or an offset like +3d or -1w.`,
      );
    },
  );

  it("Translates inclusive date comparisons to the neighbouring day", () => {
    const after = single("due>=2026-12-01");

    const before = single("due<=2026-12-01");

    expect(after).toEqual({
      fieldKey: "due",
      operator: "greaterThan",
      value: { kind: "date", value: "2026-11-30" },
    });
    expect(before).toEqual({
      fieldKey: "due",
      operator: "lessThan",
      value: { kind: "date", value: "2026-12-02" },
    });
  });

  it.each(["due>=0001-01-01", "due<=9999-12-31"])(
    "Reads %s at the domain edge as a nonempty date",
    (text) => {
      const result = parse(text);

      expect(result.errors).toEqual([]);
      expect(result.filters).toEqual([{ fieldKey: "due", operator: "isNotEmpty", value: null }]);
      expect(result.stableText).toBe(text);
    },
  );

  it.each([
    ["0001-01-01T12:00:00Z", "yesterday"],
    ["0001-01-01T12:00:00Z", "-5000w"],
    ["9999-12-31T12:00:00Z", "tomorrow"],
    ["9999-12-31T12:00:00Z", "+5000w"],
  ])("Reports a relative date outside the domain at %s + %s", (instant, value) => {
    const result = parse(`due:${value}`, { now: Temporal.Instant.from(instant) });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("is not a date");
  });
});

describe("parseItemQuery ranges and presence", () => {
  it("Rejects inclusive comparisons for numbers with a hint", () => {
    const error = onlyError("effort>=3");

    expect(error.message).toBe(
      "'>=' and '<=' work for dates and priority. For other fields use '>' or '<', or a range like 3..5.",
    );
  });

  it("Reads number and date ranges as inclusive Between filters", () => {
    const numbers = single("effort:1..5");

    const dates = single("due:2026-11-01..today");

    expect(numbers.value).toEqual({ kind: "numberRange", min: 1, max: 5 });
    expect(dates).toEqual({
      fieldKey: "due",
      operator: "between",
      value: { kind: "dateRange", min: "2026-11-01", max: "2026-11-13" },
    });
  });

  it("Reports a backwards range", () => {
    const error = onlyError("effort:5..1");

    expect(error.message).toBe("The first value must not be after the second.");
  });

  it("Allows ranges only after a colon", () => {
    const error = onlyError("effort>1..5");

    expect(error.message).toBe("Ranges like a..b go after ':' only.");
  });

  it("Allows a range two ends only", () => {
    const error = onlyError("effort:1..2..3");

    expect(error.message).toBe("A range has two ends, like 1..5.");
  });

  it("Maps has and no to presence filters", () => {
    const result = parse("has:ticket no:effort");

    expect(result.filters).toEqual([
      { fieldKey: "ticket", operator: "isNotEmpty", value: null },
      { fieldKey: "effort", operator: "isEmpty", value: null },
    ]);
  });

  it("Gives a keyword one value", () => {
    const error = onlyError("has:ticket..due");

    expect(error.message).toBe("'has:' takes one value.");
  });

  it("Maps is:done and is:open to the completed field and done includes completed", () => {
    const done = parse("is:done");
    const completed = parse("IS:Completed");

    const open = parse("is:open");

    expect(done.filters).toEqual([
      { fieldKey: "completed", operator: "equals", value: { kind: "boolean", value: true } },
    ]);
    expect(done.impliesIncludeCompleted).toBe(true);
    expect(completed.filters).toEqual(done.filters);
    expect(completed.stableText).toBe("is:done");
    expect(open.filters[0]?.value).toEqual({ kind: "boolean", value: false });
    expect(open.impliesIncludeCompleted).toBe(false);
  });

  it("Treats completed:yes as asking for completed items", () => {
    const result = parse("completed:yes");

    expect(result.impliesIncludeCompleted).toBe(true);
  });

  it("Reports is with another word", () => {
    const error = onlyError("is:late");

    expect(error.message).toBe("'is:' takes done, open or recurring.");
  });

  it("Maps is:recurring and has:reminder to the recurrence and reminder fields", () => {
    const fields = [
      ...SEARCH_FIELDS,
      builtIn("repeats", "Repeats", "Boolean"),
      builtIn("reminder", "Reminder", "Boolean"),
    ];

    const result = parse("is:recurring has:reminder", { fields });

    expect(result.errors).toEqual([]);
    expect(result.filters).toEqual<ReadonlyArray<FieldFilter>>([
      { fieldKey: "repeats", operator: "equals", value: { kind: "boolean", value: true } },
      { fieldKey: "reminder", operator: "isNotEmpty", value: null },
    ]);
    expect(result.stableText).toBe("is:recurring has:reminder");
  });
});

describe("parseItemQuery errors", () => {
  it("Suggests the nearest field for an unknown key", () => {
    const error = onlyError("tpye:error");

    expect(error).toEqual({
      position: 0,
      length: "tpye:error".length,
      message: "Unknown field 'tpye'. Did you mean 'type'?",
    });
  });

  it("Lists the fields for an unknown key with no close match", () => {
    const error = onlyError("zzzzzz:1");

    expect(error.message).toBe(
      "Unknown field 'zzzzzz'. Fields you can use: title, ticket, type, priority, due, scheduled, status, completed, link, repeats, effort, flagged.",
    );
  });

  it("Names the operators a field supports when it rejects one", () => {
    const error = onlyError("title>3");

    expect(error.message).toBe("Title ('title') does not support '>'. Use: :, !=, ~.");
  });

  it("Names a..b among the supported operators of an ordered field", () => {
    const error = onlyError("due~3");

    expect(error.message).toBe("Due Date ('due') does not support '~'. Use: :, !=, >, <, a..b.");
  });

  it("Reports where an unterminated quoted value started", () => {
    const error = onlyError('ok title:"abc');

    expect(error.position).toBe(3);
    expect(error.length).toBe('title:"abc'.length);
    expect(error.message).toBe("A quote was opened but never closed.");
  });

  it("Reports an unterminated phrase", () => {
    const error = onlyError('hello "world');

    expect(error.position).toBe(6);
  });

  it("Reports every error in position order and returns no filters", () => {
    const result = parse("effort:x due:never zzz:1");

    expect(result.errors.map((error) => error.position)).toEqual([0, 9, 19]);
    expect(result.filters).toEqual([]);
    expect(result.text).toBeNull();
  });

  it("Requires a space after a closing quote", () => {
    const error = onlyError('title:"abc"def');

    expect(error.message).toBe("Put a space after a quoted value.");
  });

  it("Describes an error with its token and one-based character", () => {
    const text = "ok tpye:error";
    const error = onlyError(text);

    const description = describeQueryParseError(error, text);

    expect(description).toBe(
      "Unknown field 'tpye'. Did you mean 'type'? (at \"tpye:error\", character 4)",
    );
  });
});

describe("parseItemQuery stable and display text", () => {
  it("Stores choices as IDs and keeps relative dates relative", () => {
    const result = parse('deadlock priority:high due<today type:"needs review"');

    expect(result.stableText).toBe(`deadlock priority:#${HIGH} due<today type:#${NEEDS_REVIEW}`);
  });

  it("Shows choice labels, keeps relative dates and parses back to the same filters", () => {
    const original = parse(`deadlock priority:#${HIGH} due<today type:"needs review"`);

    const again = parse(original.displayText);

    expect(original.displayText).toBe('deadlock priority:High due<today type:"Needs review"');
    expect(again.filters).toEqual(original.filters);
  });

  it("Parses stable text to the same filters as the original", () => {
    const original = parse("priority>=high type:error effort:1..5 is:done no:ticket");

    const again = parse(original.stableText);

    expect(again.errors).toEqual([]);
    expect(again.filters).toEqual(original.filters);
    expect(again.text).toBe(original.text);
  });

  it("Keeps stable text working after a choice label is renamed", () => {
    const original = parse("priority:high");
    const renamed = withChoices("priority", [
      choice(CRITICAL, "Blocker", 0),
      choice(HIGH, "Urgent", 1),
      choice(MEDIUM, "Medium", 2),
      choice(LOW, "Low", 3),
    ]);

    const again = parse(original.stableText, { choicesByFieldKey: renamed });
    const byOldLabel = parse("priority:high", { choicesByFieldKey: renamed });

    expect(again.filters[0]?.value).toEqual({ kind: "choice", id: HIGH });
    expect(byOldLabel.errors).toHaveLength(1);
  });

  it("Reports a choice removed after saving", () => {
    const original = parse("type:error");
    const withoutError = withChoices("type", [choice(NEEDS_REVIEW, "Needs review", 1)]);

    const again = parse(original.stableText, { choicesByFieldKey: withoutError });

    expect(again.errors.map((error) => error.message)).toEqual([
      "That Type choice no longer exists.",
    ]);
  });

  it("Reports a field removed after saving as unknown", () => {
    const original = parse("effort:3");
    const withoutEffort = SEARCH_FIELDS.filter((field) => field.key !== "effort");

    const again = parse(original.stableText, { fields: withoutEffort });

    expect(again.errors[0]?.message).toMatch(/^Unknown field 'effort'/);
  });

  it("Writes text values and numbers as typed and quotes free text that looks like syntax", () => {
    const result = parse('"a:b" title:"two words" effort:2.50');

    expect(result.stableText).toBe('"a:b" title:"two words" effort:2.50');
    expect(result.displayText).toBe(result.stableText);
  });
});

describe("queryClauseKeys", () => {
  it("Lists the lower-case keys written so choices load only when needed", () => {
    const keys = queryClauseKeys("hello Type:error priority>high type:x");

    expect(keys).toEqual(["type", "priority"]);
  });
});
