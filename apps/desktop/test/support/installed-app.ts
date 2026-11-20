import { mkdir, writeFile } from "node:fs/promises";
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
