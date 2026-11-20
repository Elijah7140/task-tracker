import { describe, expect, it } from "@effect/vitest";
import { splitCsvLinks } from "../../../src/transfer/csv/csv-link-cell.js";

describe("CSV link cells", () => {
  it("Splits addresses on any whitespace, including tabs, line breaks and no-break spaces", () => {
    const urls = splitCsvLinks(
      " https://a.example\thttps://b.example\r\nmailto:x@example.com https://c.example ",
    );

    expect(urls).toEqual([
      "https://a.example",
      "https://b.example",
      "mailto:x@example.com",
      "https://c.example",
    ]);
  });

  it("Keeps a byte order mark inside an address, as .NET whitespace rules do", () => {
    const urls = splitCsvLinks("https://a.example﻿ https://b.example");

    expect(urls).toEqual(["https://a.example﻿", "https://b.example"]);
  });

  it("Refuses more than 100 addresses and accepts exactly 100", () => {
    const hundred = Array.from({ length: 100 }, () => "https://e.example").join(" ");

    expect(splitCsvLinks(hundred)).toHaveLength(100);
    expect(splitCsvLinks(`${hundred} https://f.example`)).toBeNull();
  });
});
