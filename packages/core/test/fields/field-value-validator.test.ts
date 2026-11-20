import { expect, it } from "@effect/vitest";
import {
  archiveChoice,
  archiveField,
  createChoice,
  createField,
  validateFieldValue,
} from "../../src/index.js";

it.each([
  ["Text", { textValue: "a" }],
  ["Number", { numberValue: 0 }],
  ["Date", { dateValue: Temporal.PlainDate.from("2026-01-01") }],
  ["Boolean", { boolValue: false }],
] as const)("accepts a matching %s value", (type, value) => {
  const field = createField("field", "Field", type, null, []);
  const input = { fieldDefinitionId: field.id, ...value };

  expect(() => validateFieldValue("project", field, input)).not.toThrow();
});

it("rejects wrong types, multiple columns, and no columns", () => {
  const field = createField("field", "Field", "Text", null, []);

  expect(() =>
    validateFieldValue("project", field, { fieldDefinitionId: field.id, numberValue: 1 }),
  ).toThrow("Exactly one value");
  expect(() =>
    validateFieldValue("project", field, {
      fieldDefinitionId: field.id,
      textValue: "a",
      numberValue: 1,
    }),
  ).toThrow("Exactly one value");
  expect(() => validateFieldValue("project", field, { fieldDefinitionId: field.id })).toThrow(
    "Exactly one value",
  );
});

it.each([NaN, Infinity, -Infinity])("rejects a non-finite number of %s", (numberValue) => {
  const field = createField("field", "Field", "Number", null, []);

  expect(() =>
    validateFieldValue("project", field, { fieldDefinitionId: field.id, numberValue }),
  ).toThrow("Number must be finite.");
});

it("rejects project fields on items from another project", () => {
  const field = createField("field", "Field", "Text", "first-project", []);

  expect(() =>
    validateFieldValue("other-project", field, { fieldDefinitionId: field.id, textValue: "a" }),
  ).toThrow("Field does not belong to the item's project.");
});

it("rejects new values for archived fields", () => {
  const field = archiveField(createField("field", "Field", "Text", null, []));

  expect(() =>
    validateFieldValue("project", field, { fieldDefinitionId: field.id, textValue: "a" }),
  ).toThrow("Archived fields cannot receive new values.");
});

it("requires the selected choice to exist, be active, and belong to the field", () => {
  const field = createField("field", "Field", "Choice", null, []);
  const other = createField("other", "Other", "Choice", null, [field]);
  const choice = createChoice("one", field, "One", []);
  const foreignChoice = createChoice("foreign", other, "Foreign", []);
  const input = { fieldDefinitionId: field.id, choiceId: choice.id };

  expect(() => validateFieldValue("project", field, input, choice)).not.toThrow();
  expect(() => validateFieldValue("project", field, input)).toThrow(
    expect.objectContaining({ entity: "Choice" }),
  );
  expect(() => validateFieldValue("project", field, input, archiveChoice(choice))).toThrow(
    "Choice is missing",
  );
  expect(() =>
    validateFieldValue("project", field, { ...input, choiceId: foreignChoice.id }, foreignChoice),
  ).toThrow("Choice is missing");
});
