import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { expect, test } from "vitest";

const output = fileURLToPath(new URL("../dist/package", import.meta.url));
const executable =
  process.platform === "win32"
    ? join(output, "win-unpacked", "task-tracker.exe")
    : join(output, "linux-unpacked", "task-tracker");

// The fuse wire stores ASCII "1" and "0"; the package does not export its FuseState enum.
const FuseState = { ENABLE: "1".charCodeAt(0), DISABLE: "0".charCodeAt(0) };

test("Hardens the packaged Electron fuses except the inspector Playwright needs", async () => {
  const wire = await getCurrentFuseWire(executable);

  expect({
    runAsNode: wire[FuseV1Options.RunAsNode],
    cookieEncryption: wire[FuseV1Options.EnableCookieEncryption],
    nodeOptions: wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable],
    nodeCliInspect: wire[FuseV1Options.EnableNodeCliInspectArguments],
    asarIntegrity: wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],
    onlyAsar: wire[FuseV1Options.OnlyLoadAppFromAsar],
  }).toEqual({
    runAsNode: FuseState.ENABLE,
    cookieEncryption: FuseState.ENABLE,
    nodeOptions: FuseState.DISABLE,
    // package.mjs re-enables only this fuse in the unpacked test copy.
    nodeCliInspect: FuseState.ENABLE,
    asarIntegrity: FuseState.ENABLE,
    onlyAsar: FuseState.ENABLE,
  });
});
