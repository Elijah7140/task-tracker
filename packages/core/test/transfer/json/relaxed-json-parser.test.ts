import { describe, expect, it } from "@effect/vitest";
import { parseRelaxedJson } from "../../../src/transfer/json/relaxed-json-parser.js";
import { JsonSyntaxError } from "../../../src/transfer/json/json-syntax-error.js";

const failure = (text: string) => {
  try {
    parseRelaxedJson(text);
    return null;
  } catch (error) {
    return error instanceof JsonSyntaxError ? error.message : String(error);
  }
};

describe("relaxed JSON parser", () => {
  it("Accepts comments and trailing commas and keeps members in file order", () => {
    const node = parseRelaxedJson('{ /* note */ "b": 1, // line\n "a": [true, null,], }');

    expect(node).toEqual({
      type: "object",
      members: [
        ["b", { type: "number", raw: "1" }],
        ["a", { type: "array", items: [{ type: "boolean", value: true }, { type: "null" }] }],
      ],
    });
  });

  it("Describes malformed text with the legacy reader's wording and position", () => {
    const messages = [
      failure("{ this is not json"),
      failure(""),
      failure('{"a": 1} x'),
      failure('{"a": 01}'),
    ];

    expect(messages).toEqual([
      "'t' is an invalid start of a property name. Expected a '\"'. LineNumber: 0 | BytePositionInLine: 2.",
      "The input does not contain any JSON tokens. Expected the input to start with a valid JSON token, while isFinalBlock is true. LineNumber: 0 | BytePositionInLine: 0.",
      "'x' is invalid after a single JSON value. Expected end of data. LineNumber: 0 | BytePositionInLine: 9.",
      "'1' is an invalid end of a number. Expected a delimiter. LineNumber: 0 | BytePositionInLine: 7.",
    ]);
  });

  it("Refuses nesting deeper than 64 levels instead of overflowing the stack", () => {
    const message = failure(`${"[".repeat(100000)}${"]".repeat(100000)}`);

    expect(message).toMatch(/^The maximum configured depth of 64 has been exceeded/);
  });

  it("Decodes escapes including surrogate pairs", () => {
    const node = parseRelaxedJson('"a\\u00e9\\uD83D\\uDE80\\n"');

    expect(node).toEqual({ type: "string", value: "aé🚀\n" });
  });
});
