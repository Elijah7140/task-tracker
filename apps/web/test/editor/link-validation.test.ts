import { describe, expect, it } from "vitest";
import {
  LINK_TITLE_MAX_LENGTH,
  LINK_URL_MAX_LENGTH,
  linkProblem,
  normalizeLinkTitle,
} from "../../src/editor/link-validation.js";

describe("linkProblem", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?x=1#top",
    "HTTPS://EXAMPLE.COM",
    "mailto:team@example.com",
    "  https://example.com  ",
    "https://example.com/a%20b",
  ])("Accepts the web or mail address %j", (url) => {
    const problem = linkProblem(url, "");

    expect(problem).toBeNull();
  });

  it.each([
    ["", "Enter a link address."],
    ["   ", "Enter a link address."],
    ["example.com", "A link must be a full http, https or mailto address."],
    ["/relative", "A link must be a full http, https or mailto address."],
    ["https://", "A link must be a full http, https or mailto address."],
    ["file:///C:/secrets.txt", "A link must be a full http, https or mailto address."],
    ["javascript:alert(1)", "A link must be a full http, https or mailto address."],
    ["ftp://example.com", "A link must be a full http, https or mailto address."],
    ["https://a b.example", "A link address cannot contain spaces; write a space as %20."],
    ["https://example.com/a\tb", "A link address cannot contain spaces; write a space as %20."],
    ["https://a\u0001b.example", "A link address cannot contain control characters."],
  ])("Explains why %j is refused like the server", (url, message) => {
    const problem = linkProblem(url, "");

    expect(problem).toBe(message);
  });

  it("Applies the server's length limits after trimming", () => {
    const atLimit = "https://e.com/" + "a".repeat(LINK_URL_MAX_LENGTH - 14);
    const titleAtLimit = "t".repeat(LINK_TITLE_MAX_LENGTH);

    const accepted = linkProblem(`  ${atLimit}  `, `  ${titleAtLimit}  `);
    const longAddress = linkProblem(atLimit + "a", "");
    const longTitle = linkProblem("https://example.com", titleAtLimit + "t");

    expect(accepted).toBeNull();
    expect(longAddress).toBe("A link address must be 2000 characters or fewer.");
    expect(longTitle).toBe("A link title must be 300 characters or fewer.");
  });

  it("Treats a blank title as no title", () => {
    const titles = ["  ", "", " Spec "].map(normalizeLinkTitle);

    expect(titles).toEqual([null, null, "Spec"]);
  });
});
