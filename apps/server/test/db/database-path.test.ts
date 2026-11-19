import { expect, it } from "vitest";
import { databasePath } from "../../src/db/database-path.js";

it("Uses the explicit environment override ahead of platform directories", () => {
  const environment = { TASKTRACKER_DB_PATH: "./existing.db", XDG_DATA_HOME: "/data" };

  const path = databasePath({ environment, platform: "linux", home: "/home/sample" });

  expect(path).toBe("./existing.db");
});

it("Uses Local AppData on Windows", () => {
  const environment = { LOCALAPPDATA: "D:\\Local Data" };

  const path = databasePath({ environment, platform: "win32", home: "C:\\Users\\Sample" });

  expect(path).toBe("D:\\Local Data\\TaskTracker\\tasktracker.db");
});

it("Uses Application Support on macOS", () => {
  const path = databasePath({ environment: {}, platform: "darwin", home: "/Users/Sample" });

  expect(path).toBe("/Users/Sample/Library/Application Support/TaskTracker/tasktracker.db");
});

it.each([
  ["/data", "/data"],
  ["relative", "/home/sample/.local/share"],
  ["", "/home/sample/.local/share"],
])("Uses the Linux data directory for XDG_DATA_HOME %j", (xdg, base) => {
  const environment = { XDG_DATA_HOME: xdg };

  const path = databasePath({ environment, platform: "linux", home: "/home/sample" });

  expect(path).toBe(`${base}/TaskTracker/tasktracker.db`);
});
