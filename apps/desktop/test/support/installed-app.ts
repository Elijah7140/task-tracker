import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DesktopFixture } from "./desktop-app.js";

/** A packaged Linux build that looks like it was started from an AppImage in a private home. */
export interface FakeAppImageInstall {
  readonly appImage: string;
  readonly home: string;
  /** The test's own folder, for marker files a relaunched AppImage writes. */
  readonly folder: string;
  readonly environment: NodeJS.ProcessEnv;
}

/**
 * Creates a stand-in AppImage file and home folder inside the test's temporary
 * folder. The AppImage runtime names the file it mounted in `APPIMAGE`, which is
 * how the app knows it is installed (§7.13).
 */
export async function fakeAppImageInstall(desktop: DesktopFixture): Promise<FakeAppImageInstall> {
  const folder = dirname(dirname(desktop.database));
  const home = join(folder, "home");
  const appImage = join(folder, "Apps", "TaskTracker.AppImage");
  await mkdir(home);
  await mkdir(dirname(appImage));
  await writeFile(appImage, "old AppImage", { mode: 0o755 });
  return {
    appImage,
    home,
    folder,
    environment: { HOME: home, XDG_CONFIG_HOME: "", APPIMAGE: appImage, APPDIR: folder },
  };
}

/**
 * A stand-in AppImage that records how it was started in `marker`: the kernel's
 * no-new-privileges flag, the `APPDIR` it inherited and its arguments, one per line.
 * The real AppImage runtime cannot mount under no-new-privileges, because it
 * needs the setuid `fusermount3`, and sets `APPDIR` to its own fresh mount.
 */
export function recordingAppImage(marker: string) {
  return `#!/bin/sh
{
  grep '^NoNewPrivs:' /proc/self/status
  echo "APPDIR=\${APPDIR-unset}"
  for argument in "$@"; do printf '%s\\n' "$argument"; done
} > '${marker}.tmp'
mv '${marker}.tmp' '${marker}'
`;
}

/** The lines a {@link recordingAppImage} wrote, or nothing before it has started. */
export async function recordedStart(marker: string) {
  try {
    return (await readFile(marker, "utf8")).split("\n").slice(0, -1);
  } catch {
    return undefined;
  }
}
