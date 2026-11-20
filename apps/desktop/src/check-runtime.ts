import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app } from "electron";

// Run the probe with the same executable and mode the local server will use.
const probe = fileURLToPath(new URL("./runtime-probe.js", import.meta.url));
const result = spawnSync(process.execPath, [probe], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
}

app.exit(result.status ?? 1);
