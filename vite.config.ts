import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";

/**
 * Chromium launch settings that make browser screenshots identical on every machine of
 * one OS. The switches turn off hinting, LCD (subpixel) antialiasing and subpixel glyph
 * positioning, and the pinned fontconfig replaces the host's font settings on Linux,
 * the only OS where Chromium reads fontconfig (§11.1).
 */
const screenshotLaunchOptions = {
  args: ["--font-render-hinting=none", "--disable-lcd-text", "--disable-font-subpixel-positioning"],
  env: {
    ...process.env,
    FONTCONFIG_FILE: fileURLToPath(
      new URL("./apps/web/test/support/fontconfig/fonts.conf", import.meta.url),
    ),
  },
};

/**
 * Screenshot baselines are Linux-only (§11.1, apps/web/test/support/linux-only-screenshots.ts).
 * The on-demand Windows screenshots workflow sets TASKTRACKER_CAPTURE_SCREENSHOTS to
 * capture this platform's images for review instead (docs/CI.md).
 */
const comparesScreenshots =
  process.platform === "linux" || process.env["TASKTRACKER_CAPTURE_SCREENSHOTS"] === "1";

// Web suites read the contracts source so they run without a prior build.
const webTestResolve = {
  dedupe: ["react", "react-dom"],
  alias: {
    "@task-tracker/contracts": fileURLToPath(
      new URL("./packages/contracts/src/index.ts", import.meta.url),
    ),
  },
};

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    projects: [
      { test: { name: "workspace", include: ["test/**/*.test.ts"] } },
      { test: { name: "core", include: ["packages/core/test/**/*.test.ts"] } },
      {
        test: {
          name: "server-db",
          include: ["apps/server/test/db/**/*.test.ts", "apps/server/test/desktop/**/*.test.ts"],
        },
      },
      {
        resolve: {
          alias: {
            "@task-tracker/contracts": fileURLToPath(
              new URL("./packages/contracts/src/index.ts", import.meta.url),
            ),
          },
        },
        test: {
          name: "server-rpc",
          include: ["apps/server/test/rpc/**/*.test.ts", "packages/contracts/test/**/*.test.ts"],
        },
      },
      {
        resolve: { alias: webTestResolve.alias },
        test: {
          name: "desktop-unit",
          // Suites that launch the packaged app live in test/packaged and run from
          // apps/desktop/vitest.config.ts. The suite in test/installed installs the
          // Windows build and runs from apps/desktop/vitest.installed.config.ts.
          include: ["apps/desktop/test/**/*.test.ts"],
          exclude: ["apps/desktop/test/packaged/**", "apps/desktop/test/installed/**"],
        },
      },
      {
        extends: "./apps/web/vite.config.ts",
        root: "./apps/web",
        resolve: webTestResolve,
        test: {
          name: "web-unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.browser.test.*"],
        },
      },
      {
        extends: "./apps/web/vite.config.ts",
        root: "./apps/web",
        resolve: webTestResolve,
        // Pre-bundle browser dependencies up front so Vite never reloads mid-run on a cold cache.
        optimizeDeps: {
          entries: ["src/**/*.{ts,tsx}", "test/**/*.browser.test.tsx"],
          include: [
            "@base-ui/react/alert-dialog",
            "@base-ui/react/button",
            "@base-ui/react/checkbox",
            "@base-ui/react/context-menu",
            "@base-ui/react/dialog",
            "@base-ui/react/field",
            "@base-ui/react/input",
            "@base-ui/react/menu",
            "@base-ui/react/radio",
            "@base-ui/react/radio-group",
            "@base-ui/react/select",
            "@base-ui/react/tabs",
            "@base-ui/react/toggle",
            "@base-ui/react/toggle-group",
            "@base-ui/react/tooltip",
            "@effect/atom-react",
            "@tanstack/react-router",
            "effect",
            "effect/http",
            "effect/reactivity",
            "effect/rpc",
            "lucide-react",
            "markdown-it",
            "react",
            "react-dom",
            "react/jsx-dev-runtime",
            "react/jsx-runtime",
            "vitest-browser-react",
            "zustand",
          ],
        },
        test: {
          name: "web-browser",
          include: ["test/**/*.browser.test.tsx"],
          // Runs after the Node projects. Run alongside them on a four-core CI runner,
          // Chromium starved their workers and pushed loopback RPC tests past 5 s.
          sequence: { groupOrder: 1 },
          setupFiles: ["test/support/browser-setup.ts"],
          provide: { comparesScreenshots },
          browser: {
            enabled: true,
            headless: true,
            // Fixed locale, zone, viewport and motion keep screenshots reproducible (§11.1).
            provider: playwright({
              launchOptions: screenshotLaunchOptions,
              contextOptions: {
                locale: "en-US",
                timezoneId: "UTC",
                colorScheme: "light",
                reducedMotion: "reduce",
                deviceScaleFactor: 1,
              },
            }),
            instances: [{ browser: "chromium" }],
            viewport: { width: 1440, height: 900 },
            expect: {
              toMatchScreenshot: {
                comparatorName: "pixelmatch",
                comparatorOptions: { threshold: 0.1, allowedMismatchedPixelRatio: 0.002 },
              },
            },
          },
        },
      },
    ],
  },
});
