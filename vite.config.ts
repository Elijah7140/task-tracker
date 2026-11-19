import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";

// Web suites read the contracts source so they run without a prior build.
const webTestResolve = {
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
      { test: { name: "server-db", include: ["apps/server/test/db/**/*.test.ts"] } },
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
