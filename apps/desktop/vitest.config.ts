import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["apps/desktop/test/**/*.test.ts"],
    // Unit suites run in the root desktop-unit project and need no packaged app.
    exclude: ["apps/desktop/test/renderer.test.ts", "apps/desktop/test/server-process.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
