import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["apps/desktop/test/**/*.test.ts"],
    // Unit suites run in the root desktop-unit project and need no packaged app.
    exclude: [
      "apps/desktop/test/renderer.test.ts",
      "apps/desktop/test/server-process.test.ts",
      "apps/desktop/test/relaunch-after-exit.test.ts",
      "apps/desktop/test/relaunch-command.test.ts",
      "apps/desktop/test/relaunch-on-exit.test.ts",
      "apps/desktop/test/transfer-file-dialog.test.ts",
      "apps/desktop/test/scripts/**/*.test.ts",
      "apps/desktop/test/instance-scope.test.ts",
      "apps/desktop/test/native-notifier.test.ts",
      "apps/desktop/test/reminder-notifications.test.ts",
      "apps/desktop/test/reminder-toast.test.ts",
      "apps/desktop/test/windows-app-identity.test.ts",
      "apps/desktop/test/server-messages.test.ts",
      "apps/desktop/test/tray-close-decision.test.ts",
      "apps/desktop/test/tray-host-probe.test.ts",
      "apps/desktop/test/tray-card-placement.test.ts",
      "apps/desktop/test/tray-card-toggle.test.ts",
      "apps/desktop/test/tray-card-height.test.ts",
      "apps/desktop/test/installation/**/*.test.ts",
    ],
    // Give each packaged Electron launch the desktop session to itself. On Linux every file
    // shares one Xvfb display without a window manager, so a parallel app's window takes
    // focus: the tray card hides on blur and focusing the main window checks reminders.
    fileParallelism: false,
    // Removes the Start-menu shortcut and COM entry the unpacked copy registers on Windows.
    globalSetup: ["apps/desktop/test/support/windows-test-registration.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
