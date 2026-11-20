import { describe, expect, it } from "vitest";
import { emptyTimePlaceholder } from "../../src/editor/time-placeholder.js";

describe("emptyTimePlaceholder", () => {
  it("Uses dashes for the period column in 12-hour locales", () => {
    expect(emptyTimePlaceholder("en-US")).toBe("--:-- --");
  });

  it("Omits the period column in 24-hour locales", () => {
    expect(emptyTimePlaceholder("en-GB")).toBe("--:--");
    expect(emptyTimePlaceholder("de-DE")).toBe("--:--");
  });
});
