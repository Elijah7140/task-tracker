import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import electron from "electron";
import { createServer } from "vite-plus";

const webRoot = fileURLToPath(new URL("../../web", import.meta.url));
const vite = await createServer({ root: webRoot, server: { host: "127.0.0.1", port: 0 } });
try {
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite did not start a loopback HTTP server.");
  }
  const desktop = spawn(electron, [".", ...process.argv.slice(2)], {
    env: { ...process.env, TASKTRACKER_DEV_RENDERER: `http://127.0.0.1:${address.port}` },
    stdio: "inherit",
  });
  const stopDesktop = () => desktop.kill();
  process.once("SIGINT", stopDesktop);
  process.once("SIGTERM", stopDesktop);
  try {
    const [code] = await once(desktop, "exit");
    process.exitCode = code ?? 1;
  } finally {
    process.off("SIGINT", stopDesktop);
    process.off("SIGTERM", stopDesktop);
  }
} finally {
  await vite.close();
}
