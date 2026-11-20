import { describe, expect, it } from "@effect/vitest";
import { isBlankText, splitOnWhiteSpace, trimText, trimTextEnd } from "../../src/index.js";

describe("trimText", () => {
  it.each([
    ["ASCII space", " "],
    ["tab", "\t"],
    ["line feed", "\n"],
    ["vertical tab", "\u000b"],
    ["form feed", "\f"],
    ["carriage return", "\r"],
    ["next line", "\u0085"],
    ["no-break space", "\u00a0"],
    ["ogham space mark", "\u1680"],
    ["en quad", "\u2000"],
    ["hair space", "\u200a"],
    ["line separator", "\u2028"],
    ["paragraph separator", "\u2029"],
    ["narrow no-break space", "\u202f"],
    ["medium mathematical space", "\u205f"],
    ["ideographic space", "\u3000"],
  ])("Trims the .NET white-space character %s from both ends", (_name, space) => {
    const text = `${space}${space}Title${space}`;

    const trimmed = trimText(text);

    expect(trimmed).toBe("Title");
  });

  it.each([
    ["byte-order mark", "\ufeff"],
    ["zero-width space", "\u200b"],
    ["zero-width non-joiner", "\u200c"],
    ["word joiner", "\u2060"],
    ["Mongolian vowel separator", "\u180e"],
    ["file separator", "\u001c"],
  ])("Keeps the %s, which .NET does not treat as white space", (_name, character) => {
    const text = ` ${character}Title${character} `;

    const trimmed = trimText(text);

    expect(trimmed).toBe(`${character}Title${character}`);
  });

  it("Keeps white space inside the text", () => {
    const text = "\u00a0Two\u2028words ";

    const trimmed = trimText(text);

    expect(trimmed).toBe("Two\u2028words");
  });
});

describe("trimTextEnd", () => {
  it("Trims only trailing .NET white space", () => {
    const text = " Name\u00a0\u0085\ufeff\u3000";

    const trimmed = trimTextEnd(text);

    expect(trimmed).toBe(" Name\u00a0\u0085\ufeff");
  });
});

describe("isBlankText", () => {
  it.each([null, undefined, "", " \t\r\n", "\u00a0\u2028\u0085\u3000"])(
    "Treats %j as blank",
    (text) => {
      const blank = isBlankText(text);

      expect(blank).toBe(true);
    },
  );

  it.each(["\ufeff", " \u200b ", "x"])("Treats %j as not blank", (text) => {
    const blank = isBlankText(text);

    expect(blank).toBe(false);
  });
});

describe("splitOnWhiteSpace", () => {
  it("Splits on runs of .NET white space and drops empty parts", () => {
    const text = "\u00a0one\u0085two\ufeffthree\u200bfour  five\u3000";

    const words = splitOnWhiteSpace(text);

    expect(words).toEqual(["one", "two\ufeffthree\u200bfour", "five"]);
  });
});
