import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstalledApp } from "../../src/installation/installed-app.js";
import {
  createUpdateService,
  type UpdateServiceOptions,
} from "../../src/installation/update-service.js";
import {
  type FakeUpdateFeed,
  releaseMetadata,
  startFakeUpdateFeed,
} from "../support/fake-update-feed.js";

const APPIMAGE = "task-tracker-0.2.0-linux-x64.AppImage";
const PAYLOAD = "#!/bin/sh\necho updated\n";

let feed: FakeUpdateFeed;
let root: string;
let appImage: string;
let directory: string;

beforeEach(async () => {
  feed = await startFakeUpdateFeed();
  root = await mkdtemp(join(tmpdir(), "task-tracker-update-service-"));
  appImage = join(root, "TaskTracker.AppImage");
  directory = join(root, "profile", "updates");
  await writeFile(appImage, "old", { mode: 0o755 });
});

afterEach(async () => {
  await feed.close();
  await rm(root, { recursive: true, force: true });
});

function service(overrides: Partial<UpdateServiceOptions> = {}) {
  const installed: InstalledApp = { kind: "appimage", path: appImage };
  return createUpdateService({
    currentVersion: "0.1.0",
    installed,
    feed: new URL(feed.url),
    directory,
    fetch,
    platform: "linux",
    ...overrides,
  });
}

function serveRelease(version = "0.2.0", payload = PAYLOAD) {
  feed.serve("latest-linux.yml", { body: releaseMetadata(version, APPIMAGE, payload) });
  feed.serve(APPIMAGE, { body: payload });
}

async function downloaded(updates = service()) {
  serveRelease();
  await updates.check();
  expect(await updates.download()).toBe(true);
  return updates;
}

describe("createUpdateService", () => {
  it("An uninstalled build says so without asking the feed", async () => {
    const updates = service({ installed: undefined });

    const result = await updates.check();

    expect(updates.canUpdate).toBe(false);
    expect(result).toEqual({ outcome: "not-installed" });
    expect(feed.requests).toEqual([]);
  });

  it("An installed build without a configured feed reports the feed unavailable", async () => {
    const updates = service({ feed: undefined });

    const result = await updates.check();

    expect(result).toEqual({ outcome: "feed-unavailable" });
    expect(feed.requests).toEqual([]);
  });

  it("Download and restart without a found update each do nothing", async () => {
    const updates = service();

    const download = await updates.download();
    const restart = await updates.prepareRestart();

    expect(download).toBe(false);
    expect(restart).toBeUndefined();
    expect(feed.requests).toEqual([]);
  });

  it("A newer release is offered and its verified download waits for a restart", async () => {
    serveRelease();
    const updates = service();

    const result = await updates.check();
    const download = await updates.download();

    expect(result).toEqual({ outcome: "available", version: "0.2.0" });
    expect(download).toBe(true);
    expect(updates.readyVersion()).toBe("0.2.0");
    expect(await readFile(appImage, "utf8")).toBe("old");
  });

  it("A failed download keeps the update on offer and nothing ready", async () => {
    serveRelease("0.2.0");
    feed.serve(APPIMAGE, { body: "tampered" });
    const updates = service();
    await updates.check();

    const download = await updates.download();
    feed.serve(APPIMAGE, { body: PAYLOAD });
    const retry = await updates.download();

    expect(download).toBe(false);
    expect(retry).toBe(true);
  });

  it("Restarting re-verifies the download, replaces the AppImage and relaunches it", async () => {
    const updates = await downloaded();

    const handoff = await updates.prepareRestart();

    expect(handoff).toEqual({ kind: "relaunch", executable: appImage });
    expect(await readFile(appImage, "utf8")).toBe(PAYLOAD);
  });

  it("A restart that cannot replace the AppImage can be retried without downloading again", async () => {
    const updates = await downloaded();
    await chmod(root, 0o555);

    const refused = await updates.prepareRestart().catch(() => undefined);
    await chmod(root, 0o755);
    const retried = await updates.prepareRestart();

    expect(refused).toBeUndefined();
    expect(retried).toEqual({ kind: "relaunch", executable: appImage });
    expect(await readFile(appImage, "utf8")).toBe(PAYLOAD);
    expect(feed.requests.filter(({ path }) => path.endsWith(".AppImage"))).toHaveLength(1);
  });

  it("A download changed after verification is never installed", async () => {
    const updates = await downloaded();
    await writeFile(join(directory, APPIMAGE), "#!/bin/sh\necho tampered\n");

    const handoff = await updates.prepareRestart();

    expect(handoff).toBeUndefined();
    expect(await readFile(appImage, "utf8")).toBe("old");
    expect(updates.readyVersion()).toBeNull();
    expect(await readdir(join(root, "profile"))).toEqual([]);
  });

  it("A declined restart installs the update at the next launch, once", async () => {
    await downloaded();
    const nextLaunch = service();

    const handoff = await nextLaunch.takePendingAtStartup();
    const again = await service().takePendingAtStartup();

    expect(handoff).toEqual({ kind: "relaunch", executable: appImage });
    expect(await readFile(appImage, "utf8")).toBe(PAYLOAD);
    expect(again).toBeUndefined();
  });

  it.each([
    ["the running build is already that version", "0.2.0", PAYLOAD],
    ["the download changed since it was verified", "0.1.0", "#!/bin/sh\necho tampered\n"],
  ])("A pending update is discarded at launch when %s", async (_case, version, onDisk) => {
    await downloaded();
    await writeFile(join(directory, APPIMAGE), onDisk);

    const handoff = await service({ currentVersion: version }).takePendingAtStartup();

    expect(handoff).toBeUndefined();
    expect(await readFile(appImage, "utf8")).toBe("old");
    expect(await readdir(join(root, "profile"))).toEqual([]);
  });

  it("An uninstalled build never installs a pending update", async () => {
    await downloaded();

    const handoff = await service({ installed: undefined }).takePendingAtStartup();

    expect(handoff).toBeUndefined();
    expect(await readFile(appImage, "utf8")).toBe("old");
  });
});
