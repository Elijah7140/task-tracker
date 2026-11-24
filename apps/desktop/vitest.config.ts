import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Only these suites need a packaged app. Every other desktop suite is a unit
    // suite in the root desktop-unit project.
    include: ["apps/desktop/test/packaged/**/*.test.ts"],
    // Give each packaged Electron launch the desktop session to itself. On Linux every file
    // shares one Xvfb display without a window manager, so a parallel app's window takes
    // focus: the tray card hides on blur and focusing the main window checks reminders.
    fileParallelism: false,
    // Launches the app once before any test, then removes the Start-menu shortcut and
    // COM entry the unpacked copy registers on Windows.
    globalSetup: [
      "apps/desktop/test/support/warm-up-launch.ts",
      "apps/desktop/test/support/windows-test-registration.ts",
    ],
    // The three-core macOS release runner runs stretches of the smoke three to four
    // times slower than usual, so a test gets several times its normal 5 to 17 seconds.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Vitest's default poll gives up after 1 second. Polls here wait on the real app,
    // so they get as long as a Playwright action (ACTION_TIMEOUT in desktop-app.ts).
    expect: { poll: { timeout: 10_000 } },
  },
});
