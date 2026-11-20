import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearUpdateDirectory,
  type PendingUpdate,
  readPendingUpdate,
  writePendingUpdate,
} from "../../src/installation/pending-update.js";

const pending: PendingUpdate = {
  version: "0.2.0",
  fileName: "task-tracker-0.2.0-linux-x64.AppImage",
  sha512: `${"A".repeat(86)}==`,
  size: 12,
};

let root: string;
let directory: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "task-tracker-pending-"));
  directory = join(root, "updates");
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe("pending update record", () => {
  it("Reads back the update it recorded", async () => {
    await mkdir(directory);
    await writePendingUpdate(directory, pending);

    const read = await readPendingUpdate(directory);

    expect(read).toEqual(pending);
  });

  it.each([
    ["no record", undefined],
    ["a malformed record", "{not json"],
    ["a record naming another folder", JSON.stringify({ ...pending, fileName: "../x" })],
  ])("Reads nothing from %s", async (_case, text) => {
    await mkdir(directory);
    if (text !== undefined) {
      await writeFile(join(directory, "pending-update.json"), text);
    }

    const read = await readPendingUpdate(directory);

    expect(read).toBeUndefined();
  });

  it("Clearing removes the updater folder and leaves its parent alone", async () => {
    await mkdir(directory);
    await writePendingUpdate(directory, pending);
    await writeFile(join(root, "keep.txt"), "keep");

    await clearUpdateDirectory(directory);
    await clearUpdateDirectory(directory);

    expect(await readdir(root)).toEqual(["keep.txt"]);
  });
});
