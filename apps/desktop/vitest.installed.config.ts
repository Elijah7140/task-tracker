import { defineConfig } from "vite-plus";

/**
 * The suite that installs the real Windows build and updates it. It runs only
 * in CI's installed-update job, which builds the two installers it needs.
 */
export default defineConfig({
  test: {
    include: ["apps/desktop/test/installed/**/*.test.ts"],
    fileParallelism: false,
  },
});
