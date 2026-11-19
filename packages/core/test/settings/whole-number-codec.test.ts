import { expect, it } from "@effect/vitest";
import { wholeNumberCodec } from "../../src/index.js";

it("Values round trip as invariant text", () => {
  const codec = wholeNumberCodec(1, 8);

  const text = codec.format(6);

  expect(text).toBe("6");
  expect(codec.parse(text)).toBe(6);
  expect(codec.parse(" 8 ")).toBe(8);
});

it.each(["0", "9", "-1", "4.5", "four", ""])(
  "Text outside the range or not a whole number is rejected (%j)",
  (text) => {
    const codec = wholeNumberCodec(1, 8);

    expect(() => codec.parse(text)).toThrow();
  },
);

it("Values outside the range or not whole are not written", () => {
  const codec = wholeNumberCodec(1, 8);

  expect(() => codec.format(0)).toThrow(RangeError);
  expect(() => codec.format(9)).toThrow(RangeError);
  expect(() => codec.format(2.5)).toThrow(RangeError);
});
