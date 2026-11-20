import { describe, expect, it } from "vitest";
import { relaunchCommand } from "../src/relaunch-command.js";

const MOUNT = "/tmp/.mount_taskAbC123";
const APP_IMAGE = "/home/alex/Apps/TaskTracker.AppImage";

/** What the AppImage runtime and electron-builder's AppRun leave in the app's environment. */
const appImageEnvironment = {
  APPIMAGE: APP_IMAGE,
  APPDIR: MOUNT,
  OWD: "/home/alex",
  ARGV0: "./TaskTracker.AppImage",
  PATH: `${MOUNT}:${MOUNT}/usr/sbin:/usr/local/bin:/usr/bin`,
  LD_LIBRARY_PATH: `${MOUNT}/usr/lib`,
  XDG_DATA_DIRS: `${MOUNT}/usr/share/:/usr/local/share:/usr/share:/usr/share/gnome:/usr/local/share/:/usr/share/`,
  GSETTINGS_SCHEMA_DIR: `${MOUNT}/usr/share/glib-2.0/schemas`,
  HOME: "/home/alex",
  TASKTRACKER_DB_PATH: "/home/alex/tasks.db",
};

describe("relaunchCommand", () => {
  it("Restarts the running executable with its arguments and environment outside an AppImage", () => {
    const running = {
      executable: "/opt/task-tracker/task-tracker",
      args: ["--user-data-dir=/home/alex/profile"],
      environment: { HOME: "/home/alex" },
    };

    const command = relaunchCommand(running);

    expect(command).toEqual({
      executable: "/opt/task-tracker/task-tracker",
      args: ["--user-data-dir=/home/alex/profile"],
    });
  });

  it("Restarts the AppImage file instead of the executable in its temporary mount", () => {
    const running = {
      executable: `${MOUNT}/task-tracker`,
      args: ["--no-sandbox", "--user-data-dir=/home/alex/profile"],
      environment: appImageEnvironment,
    };

    const command = relaunchCommand(running);

    expect(command.executable).toBe(APP_IMAGE);
    expect(command.args).toEqual(["--no-sandbox", "--user-data-dir=/home/alex/profile"]);
  });

  it("Drops what the AppImage runtime set and every search path into the old mount", () => {
    const running = {
      executable: `${MOUNT}/task-tracker`,
      args: [],
      environment: appImageEnvironment,
    };

    const command = relaunchCommand(running);

    expect(command.environment).toEqual({
      PATH: "/usr/local/bin:/usr/bin",
      XDG_DATA_DIRS: "/usr/local/share:/usr/share:/usr/share/gnome:/usr/local/share/:/usr/share/",
      HOME: "/home/alex",
      TASKTRACKER_DB_PATH: "/home/alex/tasks.db",
    });
  });

  it("Keeps search paths that only share a prefix with the mount", () => {
    const environment = { APPIMAGE: APP_IMAGE, APPDIR: MOUNT, PATH: `${MOUNT}-other/bin:/usr/bin` };
    const running = { executable: `${MOUNT}/task-tracker`, args: [], environment };

    const command = relaunchCommand(running);

    expect(command.environment).toEqual({ PATH: `${MOUNT}-other/bin:/usr/bin` });
  });

  it("Ignores an APPIMAGE value that is not an absolute path", () => {
    const running = {
      executable: "/opt/task-tracker/task-tracker",
      args: [],
      environment: { APPIMAGE: "TaskTracker.AppImage" },
    };

    const command = relaunchCommand(running);

    expect(command).toEqual({ executable: "/opt/task-tracker/task-tracker", args: [] });
  });
});
