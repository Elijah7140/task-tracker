import { expect, it } from "@effect/vitest";
import {
  createStatus,
  firstDoneStatus,
  renameStatus,
  reorderStatuses,
  setStatusArchived,
  setStatusInProgress,
  statusListConflict,
  type StatusKind,
  type StatusLevel,
} from "../../src/index.js";

function status(id: string, name: string, kind: StatusKind, sortOrder: number): StatusLevel {
  return { id, name, kind, sortOrder, isArchived: false, isInProgress: false };
}

const seeded = [
  status("queued", "Queued", "Open", 0),
  status("progress", "In progress", "Open", 1),
  status("testing", "Testing", "Open", 2),
  status("completed", "Completed", "Done", 3),
];

it("Appends a status after archived entries with a fixed kind", () => {
  const rows = [...seeded, { ...status("blocked", "Blocked", "Open", 4), isArchived: true }];

  const added = createStatus("released", "  Released ", "Done", rows);

  expect(added).toEqual(status("released", "Released", "Done", 5));
});

it("Rejects an unknown status kind", () => {
  const add = () => createStatus("odd", "Odd", "Paused" as StatusKind, seeded);

  expect(add).toThrow("Choose an Open or Done status kind.");
});

it("Rejects an existing status name ignoring case", () => {
  const add = () => createStatus("copy", " testing ", "Open", seeded);
  const rename = () => renameStatus(seeded[0]!, "COMPLETED", seeded);

  expect(add).toThrow("The name 'testing' is already used by another status.");
  expect(rename).toThrow("The name 'COMPLETED' is already used by another status.");
});

it("Says to restore an archived status that reserves the name", () => {
  const rows = [...seeded, { ...status("blocked", "Blocked", "Open", 4), isArchived: true }];

  const add = () => createStatus("new", "blocked", "Open", rows);
  const rename = () => renameStatus(seeded[3]!, "blocked", rows);

  expect(add).toThrow("The name 'blocked' is used by an archived status. Restore it instead.");
  expect(rename).toThrow(
    "The name 'blocked' is used by an archived status. Restore or rename that one first.",
  );
});

it("Allows renaming a status to its own name with different case", () => {
  const renamed = renameStatus(seeded[2]!, "TESTING", seeded);

  expect(renamed.name).toBe("TESTING");
});

it("Keeps at least one Done status active", () => {
  const released = status("released", "Released", "Done", 4);
  const rows = [...seeded, released];

  const archived = setStatusArchived(seeded[3]!, true, rows);
  const lastDone = () =>
    setStatusArchived(released, true, [...seeded.slice(0, 3), archived, released]);

  expect(archived.isArchived).toBe(true);
  expect(lastDone).toThrow("At least one Done status must stay active.");
  expect(setStatusArchived(seeded[0]!, true, rows).isArchived).toBe(true);
});

it("Reorders every status, including archived entries", () => {
  const ids = ["completed", "testing", "progress", "queued"];

  const ordered = reorderStatuses(seeded, ids);

  expect(ordered.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
    ["completed", 0],
    ["testing", 1],
    ["progress", 2],
    ["queued", 3],
  ]);
  expect(() => reorderStatuses(seeded, ids.slice(1))).toThrow(
    "Order must contain every lookup exactly once.",
  );
});

it("Chooses the first active Done status in list order", () => {
  const rows = [
    ...seeded,
    { ...status("archived", "Shipped", "Done", -1), isArchived: true },
    status("released", "Released", "Done", 2),
  ];

  const first = firstDoneStatus(rows);

  expect(first?.id).toBe("released");
});

it("Reports a duplicate name or rank in a final status list", () => {
  const renamed = [
    ...seeded,
    status("urgent", "ürgent", "Open", 4),
    status("u", "Ürgent", "Open", 5),
  ];
  const ranked = [...seeded, status("released", "Released", "Done", 3)];

  expect(statusListConflict(renamed)).toBe("name");
  expect(statusListConflict(ranked)).toBe("rank");
  expect(statusListConflict(seeded)).toBeNull();
});

it("Marks an Open status as in progress and clears it again", () => {
  const queued = seeded[0]!;

  const marked = setStatusInProgress(queued, true);
  const cleared = setStatusInProgress(marked, false);

  expect(marked).toEqual({ ...queued, isInProgress: true });
  expect(cleared).toEqual(queued);
});

it("Refuses to mark a Done status as in progress", () => {
  const mark = () => setStatusInProgress(seeded[3]!, true);

  expect(mark).toThrow("Only an Open status can be marked In progress.");
});
