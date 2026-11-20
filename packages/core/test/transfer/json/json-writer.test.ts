import { describe, expect, it } from "@effect/vitest";
import { formatStjDouble, quoteStjString, writeJson } from "../../../src/index.js";
import {
  jsonArray,
  jsonBoolean,
  jsonDouble,
  jsonInteger,
  jsonObject,
  jsonString,
} from "../../../src/transfer/json/json-writer.js";

describe("JSON writer", () => {
  it("Indents with two spaces, leaves out null members and writes empty lists inline", () => {
    const value = jsonObject([
      ["name", jsonString("Billing")],
      ["missing", null],
      [
        "items",
        jsonArray([
          jsonObject([
            ["n", jsonInteger(1)],
            ["ok", jsonBoolean(true)],
          ]),
        ]),
      ],
      ["empty", jsonArray([])],
      ["settings", jsonObject([])],
    ]);

    const text = writeJson(value);

    expect(text).toBe(
      '{\n  "name": "Billing",\n  "items": [\n    {\n      "n": 1,\n      "ok": true\n    }\n  ],\n  "empty": [],\n  "settings": {}\n}',
    );
  });

  it("Uses the given line ending between lines", () => {
    const text = writeJson(jsonObject([["a", jsonDouble(2.5)]]), "\r\n");

    expect(text).toBe('{\r\n  "a": 2.5\r\n}');
  });

  it("Escapes like the legacy relaxed encoder and keeps readable text", () => {
    const samples = [
      "Café Überblick",
      '\b\f\n\r\t\u0000\u001b"\\/',
      "🚀",
      "<>&'+`",
      "a\ud800b",
      "NBSP\u00A0 ZW\u200B PUA\uE000 BOM\uFEFF \u0378 \uFFFD",
    ];

    const quoted = samples.map(quoteStjString);

    expect(quoted).toEqual([
      '"Café Überblick"',
      '"\\b\\f\\n\\r\\t\\u0000\\u001B\\"\\\\/"',
      '"\\uD83D\\uDE80"',
      '"<>&\'+`"',
      '"a\\uFFFDb"',
      '"NBSP\\u00A0 ZW\u200B PUA\\uE000 BOM\\uFEFF \\u0378 \uFFFD"',
    ]);
  });

  it("Formats doubles with the shortest round-trip digits and .NET exponent rules", () => {
    const values = [2.5, 1e20, 1.5e-7, 1e15, 1e16, 1e17, 0.0001, 0.00001, -3, -0, 5e-324, 1 / 3];

    const texts = values.map(formatStjDouble);

    expect(texts).toEqual([
      "2.5",
      "1E+20",
      "1.5E-07",
      "1000000000000000",
      "10000000000000000",
      "1E+17",
      "0.0001",
      "1E-05",
      "-3",
      "-0",
      "5E-324",
      "0.3333333333333333",
    ]);
  });
});
