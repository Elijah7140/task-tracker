import { lstatSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";
import electron from "electron";
import runtime from "electron/package.json" with { type: "json" };
import { build as buildInstaller } from "electron-builder";
import { build as bundle } from "esbuild";
import { packageOutput, unpackedExecutable } from "./package-paths.ts";
import {
  artifactName,
  nativeReleaseTarget,
  releaseChannel,
  releaseVersion,
  stageReleaseFiles,
} from "./release-files.ts";

const target = nativeReleaseTarget();
const tag = process.argv[2];
const version = tag === undefined ? "0.1.0" : releaseVersion(tag);
const repository = process.env.GITHUB_REPOSITORY ?? "Elijah7140/task-tracker";
const [owner, repo] = repository.split("/");

const desktop = fileURLToPath(new URL("..", import.meta.url));
const staging = join(desktop, "dist", "staging");
const resources = join(staging, "resources");
const app = join(staging, "app");
// A build must never recursively clean through symlinks or Windows junctions.
for (const path of [join(desktop, "dist"), staging, packageOutput]) {
  if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(`Packaging path must not be a symbolic link: ${path}`);
  }
}
await rm(staging, { recursive: true, force: true });
await rm(packageOutput, { recursive: true, force: true });
await mkdir(app, { recursive: true });

const nodeBundle = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: 'import { createRequire as bundleRequire } from "node:module"; const require = bundleRequire(import.meta.url);',
  },
};

await Promise.all([
  bundle({
    ...nodeBundle,
    entryPoints: [join(desktop, "dist", "main.js")],
    outfile: join(app, "main.mjs"),
    external: ["electron"],
  }),
  bundle({
    ...nodeBundle,
    entryPoints: [join(desktop, "..", "server", "dist", "main.js")],
    outfile: join(resources, "server.mjs"),
  }),
  cp(join(desktop, "dist", "preload.cjs"), join(app, "preload.cjs")),
  cp(join(desktop, "..", "web", "dist"), join(resources, "web"), { recursive: true }),
  writeFile(
    join(app, "package.json"),
    JSON.stringify({
      name: "task-tracker",
      version,
      description: "Projects, folders and tasks in a local desktop app.",
      author: "Elijah Harris",
      main: "main.mjs",
      desktopName: "task-tracker.desktop",
    }),
  ),
]);

// Stage only runnable files. The server runs outside the ASAR under embedded Node.
const electronDist =
  process.platform === "darwin" ? resolve(dirname(electron), "../../..") : dirname(electron);
const assets = join(desktop, "..", "..", "assets");

await buildInstaller({
  projectDir: staging,
  publish: "never",
  config: {
    appId: "app.tasktracker.desktop",
    productName: "Task Tracker",
    executableName: "task-tracker",
    electronVersion: runtime.version,
    electronDist,
    directories: { app, output: packageOutput },
    // Generate updater metadata locally. Only the release workflow can publish it.
    publish: { provider: "github", owner, repo, channel: releaseChannel(version) },
    electronUpdaterCompatibility: ">=2.16",
    artifactName: artifactName(target),
    extraResources: [{ from: resources, to: "." }],
    npmRebuild: false,
    // The server child needs RunAsNode (§4). Everything else that lets the
    // environment or command line inject code into Electron main is off.
    electronFuses: {
      runAsNode: true,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    },
    win: { target: "nsis", icon: join(assets, "icon.ico") },
    nsis: {
      // One-click per-user installation under LocalAppData/Programs. The database
      // and backups live separately in LocalAppData/TaskTracker (§7.13).
      oneClick: true,
      perMachine: false,
      deleteAppDataOnUninstall: false,
      createStartMenuShortcut: true,
      createDesktopShortcut: true,
      runAfterFinish: false,
    },
    mac: {
      target: ["dmg", "zip"],
      icon: join(assets, "icon.svg"),
      category: "public.app-category.productivity",
      // Apple silicon requires a valid local signature after flipping the fuses.
      identity: "-",
      hardenedRuntime: false,
      notarize: false,
      bundleVersion: version.split("-")[0],
      bundleShortVersion: version.split("-")[0],
    },
    linux: {
      target: "AppImage",
      icon: join(assets, "icon.png"),
      category: "Office",
      syncDesktopName: true,
    },
  },
});

// The installers above ship every fuse. Playwright attaches to Electron main with
// --inspect, so re-enable only that fuse in the unpacked copy test:desktop drives.
await flipFuses(unpackedExecutable, {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: process.platform === "darwin",
  [FuseV1Options.EnableNodeCliInspectArguments]: true,
});

await stageReleaseFiles(packageOutput, join(packageOutput, "release"), target, version);
