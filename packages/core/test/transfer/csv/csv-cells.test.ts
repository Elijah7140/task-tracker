import { describe, expect, it } from "@effect/vitest";
import { csvFieldHeader, protectCsvCell, unprotectCsvCell } from "../../../src/index.js";

describe("CSV cells", () => {
  it.each([
    ["=SUM(A1:A9)", "'=SUM(A1:A9)"],
    ["+1", "'+1"],
    ["-5", "'-5"],
    ["@cmd", "'@cmd"],
    ["\tindented", "'\tindented"],
    ["\rreturn", "'\rreturn"],
    ["'=already quoted by the user", "''=already quoted by the user"],
  ])("Gives text that starts like a formula a leading apostrophe (%j)", (text, expected) => {
    const protectedText = protectCsvCell(text);

    expect(protectedText).toBe(expected);
  });

  it.each(["", "plain", "a=b", "'plain apostrophe", "'", " =leading space is not a formula start"])(
    "Leaves other text alone (%j)",
    (text) => {
      const protectedText = protectCsvCell(text);
      const unprotectedText = unprotectCsvCell(text);

      expect(protectedText).toBe(text);
      expect(unprotectedText).toBe(text);
    },
  );

  it.each([
    ["'=SUM(A1:A9)", "=SUM(A1:A9)"],
    ["'+1", "+1"],
    ["'-5", "-5"],
    ["'@cmd", "@cmd"],
    ["''=x", "'=x"],
  ])("Removes one apostrophe in front of a formula start (%j)", (cell, expected) => {
    const text = unprotectCsvCell(cell);

    expect(text).toBe(expected);
  });

  it.each(["=1+1", "'=1+1", "''=1+1", "-", "@home", "'quoted text", "\t"])(
    "Gives the original text after protecting then unprotecting (%j)",
    (text) => {
      const roundTripped = unprotectCsvCell(protectCsvCell(text));

      expect(roundTripped).toBe(text);
    },
  );

  it.each([
    ["Title", "Title (field)"],
    ["type", "type (field)"],
    ["Due date", "Due date (field)"],
    ["Severity", "Severity"],
    ["Links (field)", "Links (field) (field)"],
    ["LINKS (FIELD) (field)", "LINKS (FIELD) (field) (field)"],
    ["Links (fielder)", "Links (fielder)"],
  ])("Suffixes a custom field header that equals a fixed header (%j)", (displayName, expected) => {
    const header = csvFieldHeader(displayName);

    expect(header).toBe(expected);
  });
});
