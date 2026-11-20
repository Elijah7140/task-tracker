import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareHandoff, WINDOWS_UPDATE_ARGUMENTS } from "../../src/installation/update-handoff.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "task-tracker-handoff-"));
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe("prepareHandoff", () => {
  it("Replaces the AppImage in place with the verified download and relaunches it", async () => {
    const appImage = join(root, "TaskTracker.AppImage");
    const downloaded = join(root, "update.AppImage");
    await writeFile(appImage, "old", { mode: 0o755 });
    await writeFile(downloaded, "new", { mode: 0o600 });

    const handoff = await prepareHandoff({ kind: "appimage", path: appImage }, downloaded);

    expect(handoff).toEqual({ kind: "relaunch", executable: appImage });
    expect(await readFile(appImage, "utf8")).toBe("new");
    expect((await stat(appImage)).mode & 0o777).toBe(0o755);
    expect((await readdir(root)).sort()).toEqual(["TaskTracker.AppImage", "update.AppImage"]);
  });

  it("Runs the Windows installer silently as an update and starts the app afterwards", async () => {
    const installer = join(root, "task-tracker-0.2.0-win-x64.exe");

    const handoff = await prepareHandoff(
      { kind: "windows-installer", executable: join(root, "task-tracker.exe") },
      installer,
    );

    expect(handoff).toEqual({ kind: "run-installer", installer, args: WINDOWS_UPDATE_ARGUMENTS });
    expect(WINDOWS_UPDATE_ARGUMENTS).toEqual(["--updated", "/S", "--force-run"]);
  });
});
