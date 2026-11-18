import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    // Enable server-rpc, web-unit and web-browser when their first suites land.
    projects: [
      { test: { name: "core", include: ["packages/core/test/**/*.test.ts"] } },
      { test: { name: "server-db", include: ["apps/server/test/db/**/*.test.ts"] } },
    ],
  },
});
