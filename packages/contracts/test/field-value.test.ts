import { Schema } from "effect";
import { expect, it } from "vitest";
import {
  FieldChoiceProjection,
  FieldDataType,
  FieldDefinitionProjection,
  FieldValueInput,
  ItemFieldValue,
} from "../src/index.js";

const fieldId = "019a0000-0000-7000-8000-00000000f001";
const projectId = "019a0000-0000-7000-8000-000000000aaa";
const choiceId = "019a0000-0000-7000-8000-00000000faaa";
const itemId = "019a0000-0000-7000-8000-000000000ccb";

it("Round-trips field definitions, choices and custom values with uppercase GUIDs and ISO dates", () => {
  const definition = Schema.decodeUnknownSync(FieldDefinitionProjection)({
    id: fieldId,
    key: "review_date",
    displayName: "Review date",
    dataType: "Date",
    projectId,
    isArchived: false,
    sortOrder: 2,
  });
  const choice = Schema.decodeUnknownSync(FieldChoiceProjection)({
    id: choiceId,
    fieldDefinitionId: fieldId,
    label: "Ready",
    sortOrder: 0,
    isArchived: false,
  });
  const sparseInput = Schema.decodeUnknownSync(FieldValueInput)({
    fieldDefinitionId: fieldId,
    numberValue: 0,
  });
  const falsyInput = Schema.decodeUnknownSync(FieldValueInput)({
    fieldDefinitionId: fieldId,
    textValue: "",
    numberValue: 0,
    dateValue: "2028-02-29",
    boolValue: false,
    choiceId,
  });
  const stored = Schema.decodeUnknownSync(ItemFieldValue)({
    itemId,
    fieldDefinitionId: fieldId,
    textValue: null,
    numberValue: null,
    dateValue: "2028-02-29",
    boolValue: null,
    choiceId: null,
  });

  expect(definition.id).toBe(fieldId.toUpperCase());
  expect(definition.projectId).toBe(projectId.toUpperCase());
  expect(Schema.encodeSync(FieldDefinitionProjection)(definition)).toEqual(definition);
  expect(choice.id).toBe(choiceId.toUpperCase());
  expect(choice.fieldDefinitionId).toBe(fieldId.toUpperCase());
  expect(sparseInput).toEqual({ fieldDefinitionId: fieldId.toUpperCase(), numberValue: 0 });
  expect(falsyInput).toEqual({
    fieldDefinitionId: fieldId.toUpperCase(),
    textValue: "",
    numberValue: 0,
    dateValue: "2028-02-29",
    boolValue: false,
    choiceId: choiceId.toUpperCase(),
  });
  expect(stored).toEqual({
    itemId: itemId.toUpperCase(),
    fieldDefinitionId: fieldId.toUpperCase(),
    textValue: null,
    numberValue: null,
    dateValue: "2028-02-29",
    boolValue: null,
    choiceId: null,
  });
  expect(Schema.encodeSync(ItemFieldValue)(stored)).toEqual(stored);
});

it.each([
  ["field data type", () => Schema.decodeUnknownSync(FieldDataType)("String")],
  [
    "leap-year invalid date",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: fieldId,
        dateValue: "2026-02-29",
      }),
  ],
  [
    "date with time component",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: fieldId,
        dateValue: "2026-12-08T00:00:00",
      }),
  ],
  [
    "NaN number",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: fieldId,
        numberValue: Number.NaN,
      }),
  ],
  [
    "positive Infinity number",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: fieldId,
        numberValue: Number.POSITIVE_INFINITY,
      }),
  ],
  [
    "negative Infinity number",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: fieldId,
        numberValue: Number.NEGATIVE_INFINITY,
      }),
  ],
  [
    "malformed fieldDefinitionId",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: "not-a-guid",
        textValue: "x",
      }),
  ],
  [
    "malformed choiceId",
    () =>
      Schema.decodeUnknownSync(FieldValueInput)({
        fieldDefinitionId: fieldId,
        choiceId: "bad-guid",
      }),
  ],
  [
    "malformed projectId",
    () =>
      Schema.decodeUnknownSync(FieldDefinitionProjection)({
        id: fieldId,
        key: "k",
        displayName: "K",
        dataType: "Text",
        projectId: "bad",
        isArchived: false,
        sortOrder: 0,
      }),
  ],
  [
    "malformed itemId",
    () =>
      Schema.decodeUnknownSync(ItemFieldValue)({
        itemId: "bad",
        fieldDefinitionId: fieldId,
        textValue: null,
        numberValue: null,
        dateValue: null,
        boolValue: null,
        choiceId: null,
      }),
  ],
] as const)("Rejects %s outside the wire contract", (_label, decode) => {
  expect(decode).toThrow();
});
