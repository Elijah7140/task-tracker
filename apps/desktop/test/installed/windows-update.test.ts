import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { instanceName } from "../../src/instance-scope.js";
import { writePendingUpdate } from "../../src/installation/pending-update.js";

const run = promisify(execFile);

/**
 * This suite installs the real NSIS build for the current user and lets it
 * update itself. The updated app is started by the installer without the test
 * environment, so it opens the default data folder (AGENTS.md, Tests). It
 * therefore runs only on a GitHub-hosted Windows runner, never on a machine
 * someone uses.
 */
const onHostedWindowsRunner = process.platform === "win32" && process.env.GITHUB_ACTIONS === "true";

const installFolder = join(process.env.LOCALAPPDATA ?? "", "Programs", "task-tracker");
const installedExecutable = join(installFolder, "task-tracker.exe");
const uninstaller = join(installFolder, "Uninstall task-tracker.exe");

/** An installer the workflow built, named `task-tracker-<version>-win-x64.exe`. */
function installerFrom(variable: string) {
  const path = process.env[variable];
  if (path === undefined || path === "") {
    throw new Error(`Set ${variable} to an installer built by package:desktop.`);
  }
  const version = /^task-tracker-(.+)-win-x64\.exe$/.exec(basename(path))?.[1];
  if (version === undefined) {
    throw new Error(`${variable} does not name a Windows installer: ${path}`);
  }
  return { path: resolve(path), version };
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The version in the installed app's manifest. `app.asar` stores `package.json` as plain text. */
async function installedVersion() {
  try {
    const archive = await readFile(join(installFolder, "resources", "app.asar"), "latin1");
    return /"name":"task-tracker","version":"([^"]+)"/.exec(archive)?.[1];
  } catch {
    return undefined;
  }
}

/** The executables of every running Task Tracker process. */
async function runningExecutables() {
  const command = "(Get-Process -Name task-tracker -ErrorAction SilentlyContinue).Path";
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", command]);
  return stdout.split(/\r?\n/).filter((line) => line !== "");
}

async function sha512AndSize(path: string) {
  const hash = createHash("sha512");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    hash.update(bytes);
    size += bytes.byteLength;
  }
  return { sha512: hash.digest("base64"), size };
}

/**
 * Leaves a verified download in the profile the app will start with, as a
 * declined restart does (§7.13). The app installs it at its next launch.
 */
async function leavePendingUpdate(
  profile: string,
  database: string,
  update: { path: string; version: string },
) {
  const instance = instanceName(database, userInfo().username);
  const updates = join(profile, "instances", instance, "updates");
  const fileName = basename(update.path);
  await mkdir(updates, { recursive: true });
  await copyFile(update.path, join(updates, fileName));
  const { sha512, size } = await sha512AndSize(update.path);
  await writePendingUpdate(updates, { version: update.version, fileName, sha512, size });
}

/** Starts the installed app on the test database and waits for it to exit on its own. */
async function launchUntilExit(profile: string, database: string) {
  const child = spawn(installedExecutable, [`--user-data-dir=${profile}`], {
    env: { ...process.env, TASKTRACKER_DB_PATH: database },
    stdio: "ignore",
  });
  const [code] = (await once(child, "exit")) as [number | null];
  return code;
}

/** Stops whatever the update left running and removes the installation. */
async function uninstall() {
  await run("taskkill.exe", ["/F", "/T", "/IM", "task-tracker.exe"]).catch(() => undefined);
  if (await exists(uninstaller)) {
    await run(uninstaller, ["/S"]).catch(() => undefined);
  }
}

test.runIf(onHostedWindowsRunner)(
  "The installed Windows app installs a pending update at launch and starts the new version",
  { timeout: 300_000 },
  async ({ onTestFinished }) => {
    const installed = installerFrom("TASKTRACKER_INSTALLED_INSTALLER");
    const update = installerFrom("TASKTRACKER_UPDATE_INSTALLER");
    const folder = await mkdtemp(join(tmpdir(), "task-tracker-installed-"));
    const database = join(folder, "data", "tasktracker.db");
    const profile = join(folder, "profile");
    await mkdir(join(folder, "data"));
    onTestFinished(async () => {
      await uninstall();
      await rm(folder, { recursive: true, force: true, maxRetries: 5 });
    });
    await run(installed.path, ["/S"]);
    expect(await installedVersion()).toBe(installed.version);
    expect(await exists(uninstaller)).toBe(true);
    await leavePendingUpdate(profile, database, update);

    const exitCode = await launchUntilExit(profile, database);

    expect(exitCode).toBe(0);
    await expect.poll(installedVersion, { timeout: 120_000, interval: 1_000 }).toBe(update.version);
    await expect
      .poll(runningExecutables, { timeout: 60_000, interval: 1_000 })
      .toContain(installedExecutable);
    expect(await exists(uninstaller)).toBe(true);
  },
);
