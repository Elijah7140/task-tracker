import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkFeed,
  downloadCandidate,
  fileMatches,
  type UpdateCandidate,
} from "../../src/installation/update-client.js";
import {
  type FakeUpdateFeed,
  releaseMetadata,
  sha512Of,
  startFakeUpdateFeed,
} from "../support/fake-update-feed.js";

const APPIMAGE = "task-tracker-0.2.0-linux-x64.AppImage";
const PAYLOAD = "#!/bin/sh\necho updated\n";

let feed: FakeUpdateFeed;
let directory: string;

beforeEach(async () => {
  feed = await startFakeUpdateFeed();
  directory = await mkdtemp(join(tmpdir(), "task-tracker-update-client-"));
});

afterEach(async () => {
  await feed.close();
  await rm(directory, { recursive: true, force: true });
});

const check = (currentVersion = "0.1.0") =>
  Effect.runPromise(
    checkFeed({ fetch, feed: new URL(feed.url), platform: "linux", currentVersion }),
  );

const candidate = (payload = PAYLOAD): UpdateCandidate => ({
  version: "0.2.0",
  address: `${feed.url}${APPIMAGE}`,
  file: { url: APPIMAGE, sha512: sha512Of(payload), size: Buffer.byteLength(payload) },
});

const download = (offered: UpdateCandidate) =>
  Effect.runPromise(downloadCandidate({ fetch, candidate: offered, directory }));

describe("checkFeed", () => {
  it("Offers a newer stable release with the installer the metadata lists", async () => {
    feed.serve("latest-linux.yml", { body: releaseMetadata("0.2.0", APPIMAGE, PAYLOAD) });

    const result = await check();

    expect(result).toEqual({ outcome: "available", candidate: candidate() });
    expect(feed.requests.map(({ path }) => path)).toEqual(["/feed/latest-linux.yml"]);
  });

  it("Reports the running version as up to date", async () => {
    feed.serve("latest-linux.yml", { body: releaseMetadata("0.2.0", APPIMAGE, PAYLOAD) });

    const result = await check("0.2.0");

    expect(result).toEqual({ outcome: "up-to-date" });
  });

  it("Ignores a prerelease even when the stable metadata names one", async () => {
    feed.serve("latest-linux.yml", { body: releaseMetadata("0.3.0-rc.1", APPIMAGE, PAYLOAD) });

    const result = await check();

    expect(result).toEqual({ outcome: "up-to-date" });
    expect(feed.requests).toHaveLength(1);
  });

  it.each([
    [404, "feed-unavailable"],
    [401, "feed-unavailable"],
    [503, "failed"],
    [500, "failed"],
  ])("Maps a %i answer to %s without sending credentials", async (status, outcome) => {
    feed.serve("latest-linux.yml", { status, body: "No" });

    const result = await check();

    expect(result).toEqual({ outcome });
    expect(feed.requests).not.toHaveLength(0);
    expect(feed.requests.every(({ headers }) => headers.authorization === undefined)).toBe(true);
  });

  it("Reports an unreachable feed as a failed check", async () => {
    const unreachable = new URL("http://127.0.0.1:1/feed/");

    const result = await Effect.runPromise(
      checkFeed({ fetch, feed: unreachable, platform: "linux", currentVersion: "0.1.0" }),
    );

    expect(result).toEqual({ outcome: "failed" });
  });

  it.each([
    ["metadata that does not parse", "<html>Sign in</html>"],
    ["metadata without an AppImage", releaseMetadata("0.2.0", "task-tracker.exe", PAYLOAD)],
  ])("Reports %s as a failed check", async (_case, body) => {
    feed.serve("latest-linux.yml", { body });

    const result = await check();

    expect(result).toEqual({ outcome: "failed" });
  });
});

describe("downloadCandidate", () => {
  it("Keeps the file only after its size and checksum match the metadata", async () => {
    feed.serve(APPIMAGE, { body: PAYLOAD });

    const path = await download(candidate());

    expect(path).toBe(join(directory, APPIMAGE));
    expect(await readFile(join(directory, APPIMAGE), "utf8")).toBe(PAYLOAD);
    expect(await readdir(directory)).toEqual([APPIMAGE]);
  });

  it.each([
    ["a different checksum", "#!/bin/sh\necho altered\n"],
    ["more bytes than stated", `${PAYLOAD}extra`],
    ["fewer bytes than stated", PAYLOAD.slice(0, 5)],
  ])("Refuses and deletes a download with %s", async (_case, served) => {
    feed.serve(APPIMAGE, { body: served });

    const path = await download(candidate());

    expect(path).toBeUndefined();
    expect(await readdir(directory)).toEqual([]);
  });

  it("Refuses a download the feed fails to serve", async () => {
    feed.serve(APPIMAGE, { status: 503 });

    const path = await download(candidate());

    expect(path).toBeUndefined();
    expect(await readdir(directory)).toEqual([]);
  });
});

describe("fileMatches", () => {
  it("Accepts the downloaded file and rejects one changed afterwards", async () => {
    const path = join(directory, APPIMAGE);
    await writeFile(path, PAYLOAD);
    const expected = candidate().file;

    const before = await Effect.runPromise(fileMatches(path, expected));
    await writeFile(path, "#!/bin/sh\necho tampered\n");
    const after = await Effect.runPromise(fileMatches(path, expected));
    const missing = await Effect.runPromise(fileMatches(join(directory, "missing"), expected));

    expect([before, after, missing]).toEqual([true, false, false]);
  });
});
