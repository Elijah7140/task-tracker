import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { TEST_BUILD_PRODUCT_NAME } from "../../scripts/product-name.ts";
import { UNPACKED_IDENTITY } from "../../src/windows-app-identity.ts";

const run = promisify(execFile);

/**
 * Vitest global teardown for the packaged smoke on Windows. The unpacked copy
 * registers its own toast activator: a Start-menu shortcut named after its
 * product name and a per-user COM server entry. Both point into the repository
 * build, so they are removed once the run ends.
 */
export async function teardown() {
  if (process.platform !== "win32" || process.env.APPDATA === undefined) {
    return;
  }
  const programs = join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  await rm(join(programs, `${TEST_BUILD_PRODUCT_NAME}.lnk`), { force: true });
  const reg = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
  const key = `HKCU\\Software\\Classes\\CLSID\\${UNPACKED_IDENTITY.toastActivatorClsid}`;
  await run(reg, ["delete", key, "/f"]).catch(() => undefined);
}
