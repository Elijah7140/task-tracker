import { expect, it } from "@effect/vitest";
import {
  archiveChoice,
  archiveField,
  createChoice,
  createField,
  renameChoice,
  reorderChoices,
  restoreChoice,
} from "../../src/index.js";

it("checks choice labels again on rename and restore", () => {
  const field = createField("status", "Status", "Choice", null, []);
  const first = createChoice("first", field, " First ", []);
  const second = createChoice("second", field, "Second", [first]);
  const archived = archiveChoice(first);

  const renamed = renameChoice(second, "First", [archived, second]);

  expect(first.label).toBe("First");
  expect(renamed).toMatchObject({ id: second.id, label: "First" });
  expect(() => renameChoice(second, " first ", [first, second])).toThrow("already used");
  expect(() => restoreChoice(archived, [archived, renamed])).toThrow("already used");
  expect(restoreChoice(archived, [archived, second])).toEqual(first);
  expect(archived.isArchived).toBe(true);
});

it("requires an active choice field and a nonblank label", () => {
  const choice = createField("status", "Status", "Choice", null, []);
  const text = createField("notes", "Notes", "Text", null, [choice]);

  expect(() => createChoice("first", choice, " ", [])).toThrow("Choice label");
  expect(() => createChoice("first", text, "First", [])).toThrow("active choice field");
  expect(() => createChoice("first", archiveField(choice), "First", [])).toThrow(
    "active choice field",
  );
});

it("scopes label uniqueness and ordering to one field and reorders archived choices", () => {
  const field = createField("status", "Status", "Choice", null, []);
  const other = createField("owner", "Owner", "Choice", null, [field]);
  const first = archiveChoice(createChoice("first", field, "Ready", []));
  const second = createChoice("second", field, "READY", [first]);
  const outside = createChoice("outside", other, "Ready", [first, second]);
  const choices = [first, second, outside];

  const reordered = reorderChoices(choices, field.id, [second.id, first.id]);

  expect(reordered).toEqual([
    { ...second, sortOrder: 0 },
    { ...first, sortOrder: 1 },
  ]);
  expect(() => createChoice("duplicate", field, " ready ", choices)).toThrow("already used");
  expect(() => reorderChoices(choices, field.id, [second.id, outside.id])).toThrow("exactly once");
});
