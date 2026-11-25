import { expect, it } from "@effect/vitest";
import { choiceCodec } from "../../src/index.js";

it("reads a choice ignoring case and white space and writes it as declared", () => {
  const codec = choiceCodec(["Top", "Bottom"]);

  const parsed = codec.parse("  bottom\n");

  expect(parsed).toBe("Bottom");
  expect(codec.format("Top")).toBe("Top");
});

it("refuses text that names no choice", () => {
  const codec = choiceCodec(["Side", "Top"]);

  const parse = () => codec.parse("Left");

  expect(parse).toThrow(SyntaxError);
});
