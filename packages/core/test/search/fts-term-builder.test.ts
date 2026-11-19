import { describe, expect, it } from "vitest";
import { buildFtsTerms } from "../../src/index.js";

describe("buildFtsTerms", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["  \t ", null],
    ["  alpha  beta ", '"alpha"* AND "beta"*'],
    ['a"b', '"a""b"*'],
    ["JIRA-1234", '"JIRA-1234"*'],
    ["* ( ) :", null],
    ["école", '"école"*'],
  ])("Converts %j into safe quoted prefix phrases", (input, expected) => {
    const result = buildFtsTerms(input);

    expect(result).toBe(expected);
  });
});
