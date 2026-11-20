import { describe, expect, it } from "@effect/vitest";
import { escapeCsvCell, parseCsv, writeCsv } from "../../../src/index.js";

describe("CSV writer", () => {
  it("Writes plain cells unquoted with CRLF line ends", () => {
    const rows = [
      ["Title", "Ticket"],
      ["Write report", "JIRA-1"],
    ];

    const text = writeCsv(rows);

    expect(text).toBe("Title,Ticket\r\nWrite report,JIRA-1\r\n");
  });

  it.each([
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line one\nline two", '"line one\nline two"'],
    ["line one\r\nline two", '"line one\r\nline two"'],
    ["carriage\rreturn", '"carriage\rreturn"'],
    [" leading", '" leading"'],
    ["trailing ", '"trailing "'],
    ["\ttabbed", '"\ttabbed"'],
  ])("Quotes cells with special characters or edge whitespace (%j)", (cell, expected) => {
    const escaped = escapeCsvCell(cell);

    expect(escaped).toBe(expected);
  });

  it("Leaves empty and inner space cells alone", () => {
    const empty = escapeCsvCell("");
    const inner = escapeCsvCell("two words");

    expect(empty).toBe("");
    expect(inner).toBe("two words");
  });

  it("Writes text that reads back to the same cells", () => {
    const cells = ["a,b", 'say "hi"', "two\r\nlines", " padded ", "", "plain"];

    const table = parseCsv(writeCsv([cells]));

    expect(table.records).toHaveLength(1);
    expect(table.records[0]!.cells).toEqual(cells);
    expect(table.issues).toEqual([]);
  });
});
