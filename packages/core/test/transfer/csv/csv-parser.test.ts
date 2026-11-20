import { describe, expect, it } from "@effect/vitest";
import { parseCsv } from "../../../src/index.js";

describe("CSV parser", () => {
  it("Ends records with CRLF, LF or CR", () => {
    const table = parseCsv("a,b\r\nc,d\ne,f\rg,h");

    expect(table.records).toHaveLength(4);
    expect(table.records[3]!.cells).toEqual(["g", "h"]);
    expect(table.records.map((record) => record.rowNumber)).toEqual([1, 2, 3, 4]);
  });

  it("Ignores a leading byte order mark", () => {
    const table = parseCsv("﻿Title,Ticket\r\nx,y\r\n");

    expect(table.records[0]!.cells).toEqual(["Title", "Ticket"]);
  });

  it("Keeps commas, quotes and line breaks in quoted cells", () => {
    const table = parseCsv('"a,b","say ""hi""","one\r\ntwo"\r\n');

    expect(table.records).toHaveLength(1);
    expect(table.records[0]!.cells).toEqual(["a,b", 'say "hi"', "one\r\ntwo"]);
  });

  it("Keeps spaces around cells and leaves empty cells empty", () => {
    const table = parseCsv(' a ,," b "\r\n');

    expect(table.records[0]!.cells).toEqual([" a ", "", " b "]);
  });

  it("Skips blank lines but still counts them as rows", () => {
    const table = parseCsv("a\r\n\r\nb\r\n");

    expect(table.records.map((record) => record.rowNumber)).toEqual([1, 3]);
  });

  it("Makes a final empty cell after a trailing comma", () => {
    const table = parseCsv("a,b,\r\n");

    expect(table.records[0]!.cells).toEqual(["a", "b", ""]);
  });

  it("Reports an unclosed quote with its row", () => {
    const table = parseCsv('a,b\r\nc,"never closed\r\n');

    expect(table.issues).toEqual([{ path: "Row 2", message: "A quoted cell is never closed." }]);
  });

  it("Reports text after a closing quote and skips it", () => {
    const table = parseCsv('"a"x,b\r\n');

    expect(table.issues).toEqual([
      { path: "Row 1", message: "Unexpected text after the closing quote of a cell." },
    ]);
    expect(table.records[0]!.cells).toEqual(["a", "b"]);
  });

  it("Finds no records in empty text", () => {
    const table = parseCsv("");

    expect(table.records).toEqual([]);
    expect(table.issues).toEqual([]);
  });

  it("Ignores every leading byte order mark, like the legacy TrimStart", () => {
    const table = parseCsv("﻿﻿Title\r\n");

    expect(table.records[0]!.cells).toEqual(["Title"]);
  });
});
