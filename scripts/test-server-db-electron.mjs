import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Resolve the same Electron binary that the desktop workspace runs.
const requireDesktop = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const electron = requireDesktop("electron");
const vitest = fileURLToPath(new URL("./vitest.mjs", import.meta.resolve("vitest/package.json")));
const result = spawnSync(electron, [vitest, "run", "--project", "server-db", "--pool", "threads"], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
}
process.exitCode = result.status ?? 1;
