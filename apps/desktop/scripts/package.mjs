import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";
import electron from "electron";
import runtime from "electron/package.json" with { type: "json" };
import { build as buildInstaller } from "electron-builder";
import { build as bundle } from "esbuild";

const desktop = fileURLToPath(new URL("..", import.meta.url));
const staging = join(desktop, "dist", "staging");
const resources = join(staging, "resources");
const app = join(staging, "app");
await rm(staging, { recursive: true, force: true });
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
      version: "0.1.0",
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
const output = join(desktop, "dist", "package");
await buildInstaller({
  projectDir: staging,
  publish: "never",
  config: {
    appId: "app.tasktracker.desktop",
    productName: "Task Tracker",
    executableName: "task-tracker",
    electronVersion: runtime.version,
    electronDist,
    directories: { app, output },
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
const unpacked =
  process.platform === "win32"
    ? join(output, "win-unpacked", "task-tracker.exe")
    : join(output, "linux-unpacked", "task-tracker");
await flipFuses(unpacked, {
  version: FuseVersion.V1,
  [FuseV1Options.EnableNodeCliInspectArguments]: true,
});
