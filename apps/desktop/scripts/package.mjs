import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
await buildInstaller({
  projectDir: staging,
  publish: "never",
  config: {
    appId: "app.tasktracker.desktop",
    productName: "Task Tracker",
    executableName: "task-tracker",
    icon: join(desktop, "..", "..", "assets", "icon.svg"),
    electronVersion: runtime.version,
    electronDist,
    directories: { app, output: join(desktop, "dist", "package") },
    extraResources: [{ from: resources, to: "." }],
    npmRebuild: false,
    win: { target: "nsis" },
    linux: { target: "AppImage", category: "Office", syncDesktopName: true },
  },
});
