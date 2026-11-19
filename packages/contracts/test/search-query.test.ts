import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ParsedSearchQuery } from "../src/index.js";

describe("Search query contracts", () => {
  it("Normalizes choice IDs in parsed filters and their choice lists", () => {
    const choiceId = "0190a1b2-0000-7000-8000-000000000003";

    const decoded = Schema.decodeUnknownSync(ParsedSearchQuery)({
      kind: "parsed",
      text: "deadlock",
      filters: [{ fieldKey: "type", operator: "equals", value: { kind: "choice", id: choiceId } }],
      stableText: `deadlock type:#${choiceId.toUpperCase()}`,
      displayText: "deadlock type:Error",
      impliesIncludeCompleted: false,
      choices: [
        {
          fieldKey: "type",
          choices: [{ id: choiceId, label: "Error", sortOrder: 0, name: null, number: null }],
        },
      ],
    });

    expect(decoded.kind === "parsed" && decoded.filters[0]?.value).toEqual({
      kind: "choice",
      id: choiceId.toUpperCase(),
    });
    expect(decoded.kind === "parsed" && decoded.choices[0]?.choices[0]?.id).toBe(
      choiceId.toUpperCase(),
    );
  });

  it("Decodes positioned parse errors with their descriptions", () => {
    const decoded = Schema.decodeUnknownSync(ParsedSearchQuery)({
      kind: "invalid",
      errors: [
        {
          position: 3,
          length: 10,
          message: "Unknown field 'tpye'. Did you mean 'type'?",
          description:
            "Unknown field 'tpye'. Did you mean 'type'? (at \"tpye:error\", character 4)",
        },
      ],
    });

    expect(decoded).toMatchObject({ kind: "invalid", errors: [{ position: 3, length: 10 }] });
  });

  it("Rejects a fractional error position", () => {
    const decode = () =>
      Schema.decodeUnknownSync(ParsedSearchQuery)({
        kind: "invalid",
        errors: [{ position: 1.5, length: 1, message: "x", description: "x" }],
      });

    expect(decode).toThrow();
  });
});
