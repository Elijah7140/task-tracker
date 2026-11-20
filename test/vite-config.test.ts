import { expect, test } from "vitest";
import config from "../vite.config.js";

interface ProjectSummary {
  readonly name: string;
  readonly browser: boolean;
  readonly groupOrder: number;
}

/** Reads each inline project's name, browser mode and run group from the workspace config. */
function projectSummaries(): ProjectSummary[] {
  const projects = config.test?.projects ?? [];
  return projects.flatMap((project) => {
    if (typeof project !== "object" || project === null || !("test" in project)) {
      return [];
    }
    const options = project.test;
    const name = options?.name;
    return [
      {
        name: typeof name === "object" ? name.label : String(name),
        browser: options?.browser?.enabled === true,
        groupOrder: options?.sequence?.groupOrder ?? 0,
      },
    ];
  });
}

test("Runs every browser project after all Node projects", () => {
  const projects = projectSummaries();

  const browserGroups = projects.filter((project) => project.browser);
  const nodeGroups = projects.filter((project) => !project.browser);
  const lastNodeGroup = Math.max(...nodeGroups.map((project) => project.groupOrder));

  expect(browserGroups.map((project) => project.name)).toEqual(["web-browser"]);
  expect(nodeGroups.map((project) => project.name)).toContain("server-rpc");
  for (const project of browserGroups) {
    expect(project.groupOrder, project.name).toBeGreaterThan(lastNodeGroup);
  }
});
