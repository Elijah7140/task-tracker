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
      : execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8" })
          .split("\n")
          .filter((line) => {
            const [, parentPid] = line.trim().split(/\s+/, 2);
            return Number(parentPid) === parent && line.includes("server.mjs");
          });
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
  return signalIfRunning(pid, 0);
}

/**
 * Sends `signal` to the PID unless the process has already exited, so cleanup
 * after a failed assertion cannot replace that failure with `kill ESRCH`.
 * Returns whether the process was still there. Refuses PIDs that would signal
 * a process group, as 0 signals the test runner's own group.
 */
export function signalIfRunning(pid: number, signal: NodeJS.Signals | 0) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Refusing to signal PID ${pid}.`);
  }
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}
