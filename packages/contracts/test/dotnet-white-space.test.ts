import { describe, expect, it } from "vitest";
import { isBlankText, trimText } from "../src/dotnet-white-space.js";

const DOTNET_WHITE_SPACE = [
  " ",
  "\t",
  "\n",
  "\u000b",
  "\f",
  "\r",
  "\u0085",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u200a",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
];

describe("trimText", () => {
  it.each(DOTNET_WHITE_SPACE)("Trims the .NET white-space character %j", (space) => {
    const text = `${space}Name${space}${space}`;

    const trimmed = trimText(text);

    expect(trimmed).toBe("Name");
  });

  it.each(["\ufeff", "\u200b", "\u2060", "\u180e", "\u001c"])(
    "Keeps %j, which .NET does not treat as white space",
    (character) => {
      const text = `\u00a0${character}Name${character} `;

      const trimmed = trimText(text);

      expect(trimmed).toBe(`${character}Name${character}`);
    },
  );
});

describe("isBlankText", () => {
  it.each(["", " \t\r\n", "\u00a0\u2028\u0085\u3000"])("Treats %j as blank", (text) => {
    const blank = isBlankText(text);

    expect(blank).toBe(true);
  });

  it.each(["\ufeff", " \u200b ", "x"])("Treats %j as not blank", (text) => {
    const blank = isBlankText(text);

    expect(blank).toBe(false);
  });
});
