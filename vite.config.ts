import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";

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
          include: [
            "apps/desktop/test/renderer.test.ts",
            "apps/desktop/test/server-process.test.ts",
            "apps/desktop/test/transfer-file-dialog.test.ts",
            "apps/desktop/test/scripts/**/*.test.ts",
            "apps/desktop/test/instance-scope.test.ts",
            "apps/desktop/test/native-notifier.test.ts",
            "apps/desktop/test/reminder-notifications.test.ts",
            "apps/desktop/test/server-messages.test.ts",
            "apps/desktop/test/tray-close-decision.test.ts",
            "apps/desktop/test/tray-host-probe.test.ts",
            "apps/desktop/test/tray-card-placement.test.ts",
            "apps/desktop/test/tray-card-toggle.test.ts",
            "apps/desktop/test/tray-card-height.test.ts",
            "apps/desktop/test/installation/**/*.test.ts",
          ],
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
          setupFiles: ["test/support/browser-setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            // Fixed locale, zone, viewport and motion keep screenshots reproducible (§11.1).
            provider: playwright({
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
