import { describe, expect, it } from "@effect/vitest";
import { createItem, MetadataRuleError } from "../../src/index.js";
import { now } from "../fixtures.js";

const create = (title: string) => createItem("A", "P", null, null, title, now);

describe("createItem", () => {
  it.each([
    ["ASCII white space", " \t\r\nTask \n", "Task"],
    ["no-break spaces", "\u00a0Task\u00a0", "Task"],
    ["line separators", "\u2028Task\u2029", "Task"],
    ["next line", "\u0085Task\u0085", "Task"],
  ])("Trims %s around the title like .NET", (_name, title, expected) => {
    const created = create(title);

    expect(created.title).toBe(expected);
  });

  it.each([
    ["byte-order mark", "\ufeffTask\ufeff"],
    ["zero-width space", "\u200bTask\u200b"],
  ])("Keeps a %s at the title's ends like .NET", (_name, title) => {
    const created = create(` ${title} `);

    expect(created.title).toBe(title);
  });

  it("Accepts a title that is only a byte-order mark, which .NET does not treat as blank", () => {
    const created = create(" \ufeff ");

    expect(created.title).toBe("\ufeff");
  });

  it("Refuses a title of only .NET white space", () => {
    const attempt = () => create("\u00a0\u2028\u3000");

    expect(attempt).toThrow(MetadataRuleError);
  });

  it("Measures the title's length after trimming", () => {
    const fits = ` ${"a".repeat(300)}\u00a0`;
    const tooLong = "a".repeat(301);

    const created = create(fits);

    expect(created.title).toBe("a".repeat(300));
    expect(() => create(tooLong)).toThrow(MetadataRuleError);
  });
});
