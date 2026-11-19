import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    // Enable web-unit and web-browser when their first suites land.
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
    ],
  },
});
