import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["apps/desktop/test/**/*.test.ts"],
    // Unit suites run in the root desktop-unit project and need no packaged app.
    exclude: [
      "apps/desktop/test/renderer.test.ts",
      "apps/desktop/test/server-process.test.ts",
      "apps/desktop/test/transfer-file-dialog.test.ts",
      "apps/desktop/test/scripts/**/*.test.ts",
      "apps/desktop/test/instance-scope.test.ts",
      "apps/desktop/test/native-notifier.test.ts",
      "apps/desktop/test/server-messages.test.ts",
      "apps/desktop/test/tray-close-decision.test.ts",
      "apps/desktop/test/tray-host-probe.test.ts",
      "apps/desktop/test/tray-card-placement.test.ts",
      "apps/desktop/test/tray-card-toggle.test.ts",
      "apps/desktop/test/tray-card-height.test.ts",
    ],
    // Give packaged Electron launches exclusive use of the native desktop session on Windows and macOS.
    fileParallelism: process.platform === "linux",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
