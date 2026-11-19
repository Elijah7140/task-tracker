import { expect, it } from "vitest";
import {
  trashContents,
  trashDeletionTime,
  trashEntries,
  trashKindLabel,
  trashLocation,
} from "../../src/trash/trash-row-labels.js";

it("Shows the server's floating deletion time in the culture using the platform's own spacing", () => {
  const deletedAt = "2026-11-13T14:00:00";
  const localHourAsUtc = Date.UTC(2026, 10, 13, 14, 0);
  const expected = (locale: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(localHourAsUtc);

  const english = trashDeletionTime(deletedAt, "en-US");
  const german = trashDeletionTime(deletedAt, "de-DE");

  expect(english).toBe(expected("en-US"));
  expect(german).toBe(expected("de-DE"));
  expect(english).toContain("2:00");
  expect(german).toContain("14:00");
});

it("Shows Home for projects and joins an item's location with chevrons", () => {
  const project = trashLocation([]);
  const item = trashLocation(["Billing", "dbo", "Tables"]);

  expect(project).toBe("Home");
  expect(item).toBe("Billing › dbo › Tables");
});

it.each([
  [0, 1, "1 item"],
  [0, 4, "4 items"],
  [1, 0, "1 folder"],
  [3, 1, "3 folders, 1 item"],
  [1, 2, "1 folder, 2 items"],
  [0, 0, "Empty"],
])("Shows %i folders and %i items as %s", (folders, items, label) => {
  const text = trashContents(folders, items);

  expect(text).toBe(label);
});

it("Names each kind and counts entries in the singular and plural", () => {
  const kinds = (["project", "folder", "item"] as const).map(trashKindLabel);

  expect(kinds).toEqual(["Project", "Folder", "Item"]);
  expect([trashEntries(1), trashEntries(3)]).toEqual(["1 entry", "3 entries"]);
});
