import { describe, expect, it } from "@effect/vitest";
import { buildTodayTree, type TodayItem, type TodayRow } from "../../src/index.js";

const compareNames = new Intl.Collator("en", { sensitivity: "accent" }).compare;

function todayItem(id: string, overrides: Partial<TodayItem> = {}): TodayItem {
  return {
    id,
    projectId: "billing",
    projectName: "Billing",
    projectOrder: 0,
    folderId: null,
    areaPath: "Billing",
    parentItemId: null,
    title: id,
    sortOrder: 0,
    isCompleted: true,
    completedToday: true,
    hasDates: false,
    statusId: null,
    statusName: null,
    priorityLevelId: null,
    ...overrides,
  };
}

const titles = (rows: ReadonlyArray<TodayRow>) => rows.map((row) => row.item.title);

describe("building the Today tree", () => {
  it("Groups projects in project order, breaking ties by name", () => {
    const items = [
      todayItem("a", { projectId: "p3", projectName: "zeta", projectOrder: 1 }),
      todayItem("b", { projectId: "p2", projectName: "Beta", projectOrder: 0 }),
      todayItem("c", { projectId: "p1", projectName: "alpha", projectOrder: 0 }),
    ];

    const tree = buildTodayTree(items, compareNames);

    expect(tree.projects.map((project) => project.name)).toEqual(["alpha", "Beta", "zeta"]);
  });

  it("Puts the project root first, then folders by breadcrumb", () => {
    const items = [
      todayItem("views", { folderId: "f2", areaPath: "Billing › dbo › Views" }),
      todayItem("root"),
      todayItem("api", { folderId: "f3", areaPath: "Billing › API" }),
      todayItem("dbo", { folderId: "f1", areaPath: "Billing › dbo" }),
    ];

    const tree = buildTodayTree(items, compareNames);

    const paths = tree.projects[0]!.areas.map((area) => area.path);
    expect(paths).toEqual(["Billing", "Billing › API", "Billing › dbo", "Billing › dbo › Views"]);
  });

  it("Keeps the tree shape with siblings in workspace order", () => {
    const items = [
      todayItem("second", { parentItemId: "context", sortOrder: 2 }),
      todayItem("context", { isCompleted: false, completedToday: false }),
      todayItem("first", { parentItemId: "context", sortOrder: 1 }),
      todayItem("grandchild", { parentItemId: "first" }),
    ];

    const tree = buildTodayTree(items, compareNames);

    const [context] = tree.projects[0]!.areas[0]!.rows;
    expect(context!.state).toBe("open");
    expect(titles(context!.children)).toEqual(["first", "second"]);
    expect(titles(context!.children[0]!.children)).toEqual(["grandchild"]);
  });

  it("Labels open and earlier ancestors and counts only today's completions", () => {
    const items = [
      todayItem("open", { isCompleted: false, completedToday: false }),
      todayItem("earlier", { parentItemId: "open", completedToday: false }),
      todayItem("parent", { parentItemId: "earlier" }),
      todayItem("child", { parentItemId: "parent" }),
      todayItem("sibling", { parentItemId: "parent", sortOrder: 1 }),
    ];

    const tree = buildTodayTree(items, compareNames);

    const open = tree.projects[0]!.areas[0]!.rows[0]!;
    const earlier = open.children[0]!;
    const parent = earlier.children[0]!;
    expect(tree.completedCount).toBe(3);
    expect(earlier.state).toBe("completedEarlier");
    expect(parent.state).toBe("completedToday");
    expect([open, earlier, parent].map((row) => row.completedDescendants)).toEqual([3, 3, 2]);
  });

  it("Shows an item whose parent is not listed as a root of its area", () => {
    const items = [todayItem("orphan", { parentItemId: "missing" })];

    const tree = buildTodayTree(items, compareNames);

    expect(titles(tree.projects[0]!.areas[0]!.rows)).toEqual(["orphan"]);
  });

  it("Is empty without completions", () => {
    const tree = buildTodayTree([], compareNames);

    expect(tree).toEqual({ completedCount: 0, projects: [] });
  });
});
