import { describe, expect, it } from "vitest";
import { isAllowedUpdateAddress, resolveUpdateFeed } from "../../src/installation/update-feed.js";

describe("resolveUpdateFeed", () => {
  it("Uses the build's feed and treats it as a folder of release files", () => {
    const feed = resolveUpdateFeed(
      undefined,
      "https://github.com/owner/repo/releases/latest/download",
    );

    expect(feed?.href).toBe("https://github.com/owner/repo/releases/latest/download/");
  });

  it("Lets the environment replace the build's feed", () => {
    const feed = resolveUpdateFeed("http://127.0.0.1:4100/feed/", "https://example.test/");

    expect(feed?.href).toBe("http://127.0.0.1:4100/feed/");
  });

  it.each([
    [undefined, undefined],
    ["", ""],
    ["not a url", undefined],
    ["http://example.test/feed/", undefined],
    ["file:///tmp/feed/", undefined],
    ["https://user:secret@example.test/feed/", undefined],
  ])("Has no feed for %j with build feed %j", (environment, built) => {
    const feed = resolveUpdateFeed(environment, built);

    expect(feed).toBeUndefined();
  });
});

describe("isAllowedUpdateAddress", () => {
  it.each([
    ["https://objects.example.test/release.AppImage", true],
    ["http://127.0.0.1:4100/latest.yml", true],
    ["http://localhost:4100/latest.yml", true],
    ["http://[::1]:4100/latest.yml", true],
    ["http://example.test/latest.yml", false],
    ["ftp://example.test/latest.yml", false],
  ])("Allows %s: %s", (address, allowed) => {
    const result = isAllowedUpdateAddress(address);

    expect(result).toBe(allowed);
  });
});
