import { execFile } from "node:child_process";
import { win32 } from "node:path";
import type { RunKey } from "./legacy-startup-entry.js";

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

/** Runs `reg.exe` with the arguments and resolves its exit code. */
export type RegRunner = (args: readonly string[]) => Promise<number>;

/**
 * The per-user Run key through `reg.exe`, which every Windows install has. Electron's
 * login item API only reads and writes the app's own value, not the legacy one.
 * `reg query` exits with 1 when the value is missing.
 */
export function windowsRunKey(run: RegRunner): RunKey {
  return {
    has: async (name) => {
      const code = await run(["query", RUN_KEY, "/v", name]);
      if (code !== 0 && code !== 1) {
        throw new Error(`reg.exe query exited with code ${code}.`);
      }
      return code === 0;
    },
    remove: async (name) => {
      const code = await run(["delete", RUN_KEY, "/v", name, "/f"]);
      if (code !== 0) {
        throw new Error(`reg.exe delete exited with code ${code}.`);
      }
    },
  };
}

/**
 * Runs the system's `reg.exe` by absolute path, so a file on `PATH` cannot stand in
 * for it, without a console window. A launch failure rejects.
 */
export function systemRegRunner(systemRoot: string): RegRunner {
  const executable = win32.join(systemRoot, "System32", "reg.exe");
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(executable, [...args], { windowsHide: true }, (error) => {
        if (error === null) {
          resolve(0);
        } else if (typeof error.code === "number") {
          resolve(error.code);
        } else {
          reject(error);
        }
      });
    });
}
