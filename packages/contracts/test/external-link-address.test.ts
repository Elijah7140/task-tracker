import { describe, expect, it } from "vitest";
import { externalLinkAddress } from "../src/external-link-address.js";

describe("externalLinkAddress", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?x=1#top",
    "HTTPS://EXAMPLE.COM",
    "mailto:team@example.com",
    "  https://example.com  ",
    "https://example.com/a%20b",
  ])("Accepts the absolute web or mail address %j", (address) => {
    expect(externalLinkAddress(address)).toBe(address.trim());
  });

  it.each([
    null,
    42,
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
    "https://example.com/a b",
    "https://example.com/a\tb",
    "https://example.com/a\u0001b",
    "mailto:team@example.com?subject=a\u0001b",
  ])("Rejects the unsupported or malformed address %j", (address) => {
    expect(externalLinkAddress(address)).toBeUndefined();
  });

  it("Enforces the address length limit after trimming", () => {
    const prefix = "https://e.com/";
    const longestAddress = prefix + "a".repeat(2000 - prefix.length);

    expect(externalLinkAddress(`  ${longestAddress}  `)).toBe(longestAddress);
    expect(externalLinkAddress(longestAddress + "a")).toBeUndefined();
  });

  it("Trims like .NET, so a byte-order mark stays and makes the address invalid", () => {
    const padded = externalLinkAddress("\u0085https://example.com\u00a0");

    const marked = externalLinkAddress("\ufeffhttps://example.com");

    expect(padded).toBe("https://example.com");
    expect(marked).toBeUndefined();
  });
});
