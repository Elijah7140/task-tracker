import { expect, it } from "@effect/vitest";
import {
  archiveField,
  changeFieldType,
  createField,
  effectiveFields,
  listFields,
  renameField,
  reorderFields,
  restoreField,
} from "../../src/index.js";

it("uses a stable slug with a collision suffix", () => {
  const field = createField("first", " Customer impact ", "Text", null, []);
  const second = createField("second", "Customer impact", "Text", "another-project", [
    archiveField(field),
  ]);

  const renamed = renameField(field, "Impact", [field]);

  expect(field.key).toBe("customer-impact");
  expect(second.key).toBe("customer-impact-2");
  expect(renamed).toMatchObject({ key: "customer-impact", displayName: "Impact" });
});

it("locks a field type while any value exists", () => {
  const field = createField("effort", "Effort", "Number", null, []);

  expect(() => changeFieldType(field, "Date", true)).toThrow(
    "A field with values cannot change type.",
  );
  expect(changeFieldType(field, "Number", true)).toEqual(field);
  expect(field.dataType).toBe("Number");
});

it("changes the type of a field without values", () => {
  const field = createField("effort", "Effort", "Number", null, []);

  const changed = changeFieldType(field, "Date", false);

  expect(changed.dataType).toBe("Date");
});

it("requires a nonblank display name", () => {
  expect(() => createField("field", " ", "Text", null, [])).toThrow("Field name");
});

it("lists active global fields before project fields and sorts each scope", () => {
  const local = createField("local", "Local", "Text", "project", []);
  const other = createField("other", "Other", "Text", "other-project", [local]);
  const first = createField("first", "First", "Text", null, [local, other]);
  const second = createField("second", "Second", "Text", null, [local, other, first]);
  const archived = archiveField(createField("archived", "Archived", "Text", null, [first, second]));
  const rows = [second, other, local, archived, first];

  const effective = effectiveFields(rows, "project");

  expect(effective.map((field) => field.id)).toEqual(["first", "second", "local"]);
  expect(listFields(rows, "project").map((field) => field.id)).toEqual([
    "local",
    "first",
    "second",
    "archived",
  ]);
});

it("rejects a project name already visible globally even with different case or spacing", () => {
  const field = createField("global", "Impact", "Text", null, []);

  expect(() => createField("local", " impact ", "Text", "project", [field])).toThrow(
    "Field name is already visible in this project.",
  );
});

it("rejects a global name already used in a project and allows the name in unrelated projects", () => {
  const field = createField("local", "Impact", "Text", "project", []);

  const other = createField("other", "IMPACT", "Text", "other-project", [field]);

  expect(other.key).toBe("impact-2");
  expect(() => createField("global", "IMPACT", "Text", null, [field])).toThrow(
    "Field name is already visible in this project.",
  );
});

it("checks visible names again on rename and restore", () => {
  const first = createField("first", "First", "Text", null, []);
  const second = createField("second", "Second", "Text", null, [first]);
  const archived = archiveField(first);

  const renamed = renameField(second, "First", [archived, second]);

  expect(() => renameField(second, " first ", [first, second])).toThrow("already visible");
  expect(() => restoreField(archived, [archived, renamed])).toThrow("already visible");
  expect(restoreField(archived, [archived, second])).toEqual(first);
  expect(archived.isArchived).toBe(true);
});

it("reserves the stable key of an archived field", () => {
  const archived = archiveField(createField("first", "Impact", "Text", null, []));

  const second = createField("second", "Impact", "Text", null, [archived]);

  expect(second.key).toBe("impact-2");
});

it("reorders every field in a scope, including archived fields", () => {
  const global = createField("global", "Global", "Text", null, []);
  const first = archiveField(createField("first", "First", "Text", "project", [global]));
  const second = createField("second", "Second", "Text", "project", [global, first]);
  const fields = [global, first, second];

  const reordered = reorderFields(fields, "project", [second.id, first.id]);

  expect(reordered).toEqual([
    { ...second, sortOrder: 0 },
    { ...first, sortOrder: 1 },
  ]);
  expect(() => reorderFields(fields, "project", [second.id, global.id])).toThrow("exactly once");
});

it("uses a fallback slug and fits collision suffixes within the legacy key limit", () => {
  const fallback = createField("fallback", "☀", "Text", null, []);
  const first = createField("first", "X".repeat(300), "Text", "project", [fallback]);
  const second = createField("second", "X".repeat(300), "Text", "other-project", [fallback, first]);

  expect(fallback.key).toBe("field");
  expect(second.key).toBe("x".repeat(298) + "-2");
});
