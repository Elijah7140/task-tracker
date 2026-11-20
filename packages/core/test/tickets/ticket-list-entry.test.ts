import { expect, it } from "@effect/vitest";
import {
  archiveTicketListEntry,
  createTicketListEntry,
  renameTicketListEntry,
  reorderTicketListEntries,
  restoreTicketListEntry,
  type TicketListEntry,
} from "../../src/index.js";

function levels(): TicketListEntry[] {
  const app = createTicketListEntry("app", "Application", null, "ClockTower", []);
  const module = createTicketListEntry("train", "Module", app.id, "Train", [app]);
  return [app, module];
}

it("appends entries below their siblings in the same list and parent", () => {
  const [app, module] = levels();

  const second = createTicketListEntry("time", "Module", app!.id, "Time", [app!, module!]);
  const person = createTicketListEntry("wayne", "Person", null, "  Wayne  ", [app!, module!]);

  expect(second.sortOrder).toBe(1);
  expect(person).toEqual({
    id: "wayne",
    listKind: "Person",
    parentId: null,
    name: "Wayne",
    isArchived: false,
    sortOrder: 0,
  });
});

it("requires each level to sit under the level above it", () => {
  const rows = levels();

  expect(() => createTicketListEntry("x", "Module", null, "Loose", rows)).toThrow(
    "A module belongs to an application.",
  );
  expect(() => createTicketListEntry("x", "Interface", "app", "Wrong", rows)).toThrow(
    "An interface belongs to a module.",
  );
  expect(() => createTicketListEntry("x", "Person", "app", "Nested", rows)).toThrow(
    "A person has no parent entry.",
  );
});

it("keeps names unique among siblings but allows the same name under another parent", () => {
  const rows = levels();
  const otherApp = createTicketListEntry("other", "Application", null, "Payroll", rows);
  const all = [...rows, otherApp];

  const sameName = createTicketListEntry("payroll-train", "Module", otherApp.id, "train", all);

  expect(sameName.name).toBe("train");
  expect(() => createTicketListEntry("dup", "Module", "app", "TRAIN", all)).toThrow(
    "The name 'TRAIN' is already used by another module.",
  );
});

it("refuses a name an archived sibling still holds and suggests restoring it", () => {
  const [app, module] = levels();
  const archived = archiveTicketListEntry(module!);

  const attempt = () =>
    createTicketListEntry("again", "Module", app!.id, "Train", [app!, archived]);

  expect(attempt).toThrow("The name 'Train' is used by an archived module. Restore it instead.");
  expect(restoreTicketListEntry(archived).isArchived).toBe(false);
});

it("renames an entry, allowing a change of case to its own name", () => {
  const [app, module] = levels();

  const renamed = renameTicketListEntry(module!, "TRAIN", [app!, module!]);

  expect(renamed.name).toBe("TRAIN");
  expect(() => renameTicketListEntry(module!, " ", [app!, module!])).toThrow(
    "Name must be 1 to 300 characters.",
  );
});

it("reorders one list level and requires every sibling", () => {
  const [app, module] = levels();
  const time = createTicketListEntry("time", "Module", app!.id, "Time", [app!, module!]);
  const rows = [app!, module!, time];

  const ordered = reorderTicketListEntries(rows, "Module", app!.id, ["time", "train"]);

  expect(ordered.map((row) => [row.id, row.sortOrder])).toEqual([
    ["time", 0],
    ["train", 1],
  ]);
  expect(() => reorderTicketListEntries(rows, "Module", app!.id, ["time"])).toThrow(
    "Order must contain every entry of the list exactly once.",
  );
});
