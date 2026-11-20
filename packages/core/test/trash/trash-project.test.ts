import { expect, it } from "@effect/vitest";
import { HierarchyError, type Project, TrashProject } from "../../src/index.js";
import { appendRestoreOrder } from "../../src/trash/trash-project.js";
import { earlier, folder, item, now, projectId } from "../fixtures.js";

const project: Project = {
  id: projectId,
  name: "Billing",
  description: null,
  iconKey: null,
  sortOrder: 0,
  createdAtUtc: earlier,
  updatedAtUtc: earlier,
  deletedAtUtc: null,
  deletionBatchId: null,
};

const deleted = (batch: string) => ({ deletedAtUtc: now, deletionBatchId: batch });

it("Appends after the largest sibling order, keeping gaps, and starts an empty level at zero", () => {
  const siblings = [{ sortOrder: 0 }, { sortOrder: 5 }, { sortOrder: 2 }];

  const appended = appendRestoreOrder(siblings);
  const first = appendRestoreOrder([]);

  expect(appended).toBe(6);
  expect(first).toBe(0);
});

it("Groups rows by batch and takes the topmost deleted row as the batch's top node", () => {
  const rows = new TrashProject(
    project,
    [
      folder("outer", { name: "Outer", ...deleted("B1") }),
      folder("inner", { parentFolderId: "outer", ...deleted("B1") }),
    ],
    [
      item("task", { folderId: "inner", ...deleted("B1") }),
      item("loose", { title: "Loose", ...deleted("B2") }),
    ],
  );

  const batches = rows.batches();

  expect(batches.map(({ id, top }) => [id, top.kind, top.row.id])).toEqual([
    ["B1", "folder", "outer"],
    ["B2", "item", "loose"],
  ]);
  expect(batches[0]).toMatchObject({ folders: { length: 2 }, items: { length: 1 } });
});

it("Purges a deep item branch children first without recursion", () => {
  const depth = 5_000;
  const chain = Array.from({ length: depth }, (_, level) =>
    item(`item-${level}`, {
      parentItemId: level === 0 ? null : `item-${level - 1}`,
      ...deleted("B"),
    }),
  );
  const rows = new TrashProject(project, [], chain.toReversed());

  const plan = rows.purgePlan(rows.batches()[0]);

  expect(plan.itemIds).toHaveLength(depth);
  expect(plan.itemIds[0]).toBe(`item-${depth - 1}`);
  expect(plan.itemIds.at(-1)).toBe("item-0");
});

it("Refuses to purge a branch whose rows form a hierarchy cycle", () => {
  const rows = new TrashProject(
    project,
    [],
    [
      item("a", { parentItemId: "b", ...deleted("B") }),
      item("b", { parentItemId: "a", ...deleted("B") }),
    ],
  );

  const purge = () => rows.purgePlan();

  expect(purge).toThrow(HierarchyError);
});
