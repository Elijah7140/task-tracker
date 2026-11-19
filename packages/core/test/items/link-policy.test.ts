import { describe, expect, it } from "@effect/vitest";
import { LinkPolicy } from "../../src/index.js";

describe("LinkPolicy", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?x=1#top",
    "HTTPS://EXAMPLE.COM",
    "mailto:team@example.com",
    "  https://example.com  ",
    "https://example.com/a%20b",
  ])("Accepts and opens the web or mail address %j", (url) => {
    const openable = LinkPolicy.isOpenable(url);

    const problem = LinkPolicy.validate(url, null);

    expect(openable).toBe(true);
    expect(problem).toBeNull();
  });

  it.each([
    null,
    "",
    "   ",
    "example.com",
    "/relative",
    "//example.com",
    "https://",
    "https:///example.com",
    "https://\\example.com",
    "file:///C:/secrets.txt",
    "file://server/share",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://example.com",
    "ssh://example.com",
    "tel:+123",
    "myapp://open",
  ])("Neither accepts nor opens %j", (url) => {
    const openable = LinkPolicy.isOpenable(url);

    const problem = LinkPolicy.validate(url, null);

    expect(openable).toBe(false);
    expect(problem).not.toBeNull();
  });

  it.each([
    ["", "Enter a link address."],
    ["example.com", "A link must be a full http, https or mailto address."],
    ["file:///C:/secrets.txt", "A link must be a full http, https or mailto address."],
    ["javascript:alert(1)", "A link must be a full http, https or mailto address."],
    ["https://a b.example", "A link address cannot contain spaces; write a space as %20."],
    ["https://a\u0001b.example", "A link address cannot contain control characters."],
  ])("Explains why %j is refused", (url, message) => {
    const problem = LinkPolicy.validate(url, null);

    expect(problem).toBe(message);
  });

  it.each([
    "https://example.com/a b",
    "https://example.com/a\tb",
    "https://example.com/a\u0001b",
    "mailto:team@example.com?subject=a\u0001b",
  ])("Rejects whitespace or controls inside %j for saving and launching", (url) => {
    const problem = LinkPolicy.validate(url, null);

    expect(problem).not.toBeNull();
    expect(LinkPolicy.isOpenable(url)).toBe(false);
  });

  it("Applies the length limits after trimming", () => {
    const atLimit = "https://e.com/" + "a".repeat(LinkPolicy.URL_MAX_LENGTH - 14);
    const titleAtLimit = "t".repeat(LinkPolicy.TITLE_MAX_LENGTH);

    const accepted = LinkPolicy.validate(atLimit, titleAtLimit);
    const padded = LinkPolicy.validate(`  ${atLimit}  `, `  ${titleAtLimit}  `);
    const longAddress = LinkPolicy.validate(atLimit + "a", null);
    const longTitle = LinkPolicy.validate("https://example.com", titleAtLimit + "t");

    expect(accepted).toBeNull();
    expect(padded).toBeNull();
    expect(longAddress).toBe("A link address must be 2000 characters or fewer.");
    expect(longTitle).toBe("A link title must be 300 characters or fewer.");
  });

  it("Stores blank titles as null and trims the others", () => {
    const titles = ["  ", null, "  Spec "].map(LinkPolicy.normalizeTitle);

    expect(titles).toEqual([null, null, "Spec"]);
    expect(LinkPolicy.normalizeUrl("  https://a.example ")).toBe("https://a.example");
    expect(LinkPolicy.normalizeUrl(null)).toBe("");
  });
});
