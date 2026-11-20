import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { expect } from "vitest";
import {
  type DesktopFixture,
  desktopEnvironment,
  desktopTest,
  executable,
  firstWindow,
  launch,
} from "./support/desktop-app.js";
import { serverChildren, serverPid } from "./support/desktop-processes.js";

function start(desktop: DesktopFixture) {
  return spawn(executable, [`--user-data-dir=${desktop.profile}`], {
    env: desktopEnvironment(desktop),
    stdio: "ignore",
  });
}

async function stop(instance: ChildProcess) {
  if (instance.exitCode === null && instance.signalCode === null) {
    const exited = once(instance, "exit");
    instance.kill();
    await exited;
  }
}

desktopTest(
  "Two launches racing on the same database leave one running instance",
  async ({ desktop }) => {
    const instances = [start(desktop), start(desktop)];
    try {
      const [code, signal] = (await Promise.race(
        instances.map((instance) => once(instance, "exit")),
      )) as [number | null, NodeJS.Signals | null];
      const survivor = instances.find((instance) => instance.exitCode === null);

      expect([code, signal]).toEqual([0, null]);
      expect(survivor?.pid).toBeDefined();
      const pid = survivor?.pid ?? 0;
      await expect.poll(() => serverChildren(pid), { timeout: 15_000 }).toHaveLength(1);
    } finally {
      await Promise.all(instances.map(stop));
    }
  },
);

desktopTest("Different databases run side by side on one profile", async ({ desktop }) => {
  const other = { ...desktop, database: join(desktop.database, "..", "other.db") };
  const first = await launch(desktop);
  try {
    const second = await launch(other);
    try {
      const pages = await Promise.all([firstWindow(first), firstWindow(second)]);
      await Promise.all(pages.map((page) => page.getByTestId("empty-home-create").waitFor()));

      expect(await serverPid(second)).not.toBe(await serverPid(first));
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
});
