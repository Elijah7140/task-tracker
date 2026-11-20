import { describe, expect, it } from "vitest";
import {
  installerFor,
  metadataFileName,
  parseUpdateMetadata,
} from "../../src/installation/update-metadata.js";

const SHA = `${"A".repeat(86)}==`;

/** Metadata as electron-builder writes it next to a release (§7.13, WP41). */
const linuxMetadata = [
  "version: 0.2.0",
  "files:",
  "  - url: task-tracker-0.2.0-linux-x64.AppImage",
  `    sha512: ${SHA}`,
  "    size: 104857600",
  "    blockMapSize: 1234",
  "path: task-tracker-0.2.0-linux-x64.AppImage",
  `sha512: ${SHA}`,
  "releaseDate: '2026-11-18T20:00:00.000Z'",
  "",
].join("\n");

describe("parseUpdateMetadata", () => {
  it("Reads the version and each file with its checksum and size", () => {
    const metadata = parseUpdateMetadata(linuxMetadata);

    expect(metadata).toEqual({
      version: "0.2.0",
      files: [{ url: "task-tracker-0.2.0-linux-x64.AppImage", sha512: SHA, size: 104_857_600 }],
    });
  });

  it("Accepts quoted values and Windows line endings", () => {
    const text = [
      "version: '0.2.0'",
      "files:",
      '  - url: "task-tracker-0.2.0-win-x64.exe"',
      `    sha512: '${SHA}'`,
      "    size: 10",
    ].join("\r\n");

    const metadata = parseUpdateMetadata(text);

    expect(metadata?.files[0]?.url).toBe("task-tracker-0.2.0-win-x64.exe");
    expect(metadata?.version).toBe("0.2.0");
  });

  it.each([
    ["a file outside the release", "../escape.AppImage", SHA],
    ["an absolute address", "https://example.test/task-tracker.AppImage", SHA],
    ["a malformed checksum", "task-tracker.AppImage", "not-a-checksum"],
  ])("Refuses metadata naming %s", (_case, url, sha512) => {
    const text = `version: 0.2.0\nfiles:\n  - url: ${url}\n    sha512: ${sha512}\n    size: 10\n`;

    const metadata = parseUpdateMetadata(text);

    expect(metadata).toBeUndefined();
  });

  it.each([
    "",
    "<html>Not found</html>",
    "version: 0.2.0\n",
    "files:\n  - url: a.AppImage\n",
    `version: 0.2.0\nfiles:\n  - url: a.AppImage\n    sha512: ${SHA}\n    size: -1\n`,
    `version: 0.2.0\nfiles:\n  - url: a.AppImage\n    sha512: ${SHA}\n    size: 10\n  nested:\n    - x\n`,
  ])("Refuses text that is not update metadata: %j", (text) => {
    const metadata = parseUpdateMetadata(text);

    expect(metadata).toBeUndefined();
  });
});

describe("metadataFileName", () => {
  it("Reads only the stable channel for Windows and Linux", () => {
    const names = [
      metadataFileName("win32"),
      metadataFileName("linux"),
      metadataFileName("darwin"),
    ];

    expect(names).toEqual(["latest.yml", "latest-linux.yml", undefined]);
  });
});

describe("installerFor", () => {
  it("Picks the Windows installer or the AppImage from the listed files", () => {
    const metadata = {
      version: "0.2.0",
      files: [
        { url: "task-tracker-0.2.0-win-x64.exe.blockmap", sha512: SHA, size: 1 },
        { url: "task-tracker-0.2.0-win-x64.exe", sha512: SHA, size: 2 },
        { url: "task-tracker-0.2.0-linux-x64.AppImage", sha512: SHA, size: 3 },
      ],
    };

    const picked = [installerFor(metadata, "win32")?.size, installerFor(metadata, "linux")?.size];

    expect(picked).toEqual([2, 3]);
  });
});
