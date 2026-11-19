import { execFileSync } from "node:child_process";
import type { ElectronApplication } from "playwright";

/** Lists child processes of `parent` whose command line names the bundled server. */
export function serverChildren(parent: number) {
  const lines =
    process.platform === "win32"
      ? execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${parent}' | Where-Object { $_.CommandLine -match 'server[.]mjs' } | Select-Object -ExpandProperty ProcessId`,
          ],
          { encoding: "utf8" },
        ).split("\n")
      : execFileSync("ps", ["-o", "pid=,args=", "--ppid", String(parent)], { encoding: "utf8" })
          .split("\n")
          .filter((line) => line.includes("server.mjs"));
  return lines
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid));
}

/** Reads the PID from Electron main, which can differ from Playwright's launcher PID on Windows. */
export function mainPid(application: ElectronApplication) {
  return application.evaluate(() => process.pid);
}

/** Finds the bundled server child of the process hosting Electron main. */
export async function serverPid(application: ElectronApplication) {
  const [pid] = serverChildren(await mainPid(application));
  if (pid === undefined) {
    throw new Error("Could not find the running RPC server.");
  }
  return pid;
}

/** Checks whether the OS still has a live process for the PID. */
export function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}
