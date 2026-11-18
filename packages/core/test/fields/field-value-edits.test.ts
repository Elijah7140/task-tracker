import { expect, it } from "@effect/vitest";
import {
  archiveChoice,
  archiveField,
  createChoice,
  createField,
  planFieldValueEdits,
} from "../../src/index.js";

it("rejects an invalid custom edit without modifying the original values", () => {
  const text = createField("text", "Text", "Text", null, []);
  const number = createField("number", "Number", "Number", null, [text]);
  const { upserts: existing } = planFieldValueEdits(
    "item",
    "project",
    [text],
    [],
    [],
    [{ fieldDefinitionId: text.id, textValue: "original" }],
  );

  expect(() =>
    planFieldValueEdits("item", "project", [text, number], [], existing, [
      { fieldDefinitionId: text.id, textValue: "changed" },
      { fieldDefinitionId: number.id, numberValue: NaN },
    ]),
  ).toThrow("Number must be finite.");
  expect(existing).toMatchObject([{ textValue: "original" }]);
});

it("keeps an unchanged archived choice through an item edit", () => {
  const field = createField("status", "Status", "Choice", null, []);
  const choice = createChoice("ready", field, "Ready", []);
  const input = { fieldDefinitionId: field.id, choiceId: choice.id };
  const { upserts } = planFieldValueEdits("item", "project", [field], [choice], [], [input]);

  const edit = planFieldValueEdits("item", "project", [field], [archiveChoice(choice)], upserts, [
    input,
  ]);

  expect(edit).toEqual({ upserts: [], removals: [] });
  expect(() =>
    planFieldValueEdits("item", "project", [field], [archiveChoice(choice)], [], [input]),
  ).toThrow("Choice is missing");
});

it("rejects an edit that sets or clears another project's field", () => {
  const field = createField("local", "Local", "Text", "first", []);
  const input = { fieldDefinitionId: field.id };

  expect(() =>
    planFieldValueEdits("item", "second", [field], [], [], [{ ...input, textValue: "value" }]),
  ).toThrow("Field does not belong to the item's project.");
  expect(() => planFieldValueEdits("item", "second", [field], [], [], [input])).toThrow(
    "Field does not belong to the item's project.",
  );
});

it("preserves omitted archived values and removes rows for blank text or null", () => {
  const archived = createField("archived", "Archived", "Text", null, []);
  const edited = createField("edited", "Edited", "Text", null, [archived]);
  const cleared = createField("cleared", "Cleared", "Boolean", null, [archived, edited]);
  const { upserts } = planFieldValueEdits(
    "item",
    "project",
    [archived, edited, cleared],
    [],
    [],
    [
      { fieldDefinitionId: archived.id, textValue: "keep" },
      { fieldDefinitionId: edited.id, textValue: " trim " },
      { fieldDefinitionId: cleared.id, boolValue: false },
    ],
  );

  const edit = planFieldValueEdits(
    "item",
    "project",
    [archiveField(archived), edited, cleared],
    [],
    upserts,
    [
      { fieldDefinitionId: edited.id, textValue: " " },
      { fieldDefinitionId: cleared.id, boolValue: null },
    ],
  );

  expect(edit).toEqual({ upserts: [], removals: [edited.id, cleared.id] });
  expect(upserts[0]?.textValue).toBe("keep");
  expect(upserts[1]?.textValue).toBe("trim");
});

it("plans typed rows for all five data types", () => {
  const text = createField("text", "Text", "Text", null, []);
  const number = createField("number", "Number", "Number", null, [text]);
  const date = createField("date", "Date", "Date", null, [text, number]);
  const boolean = createField("boolean", "Boolean", "Boolean", null, [text, number, date]);
  const status = createField("status", "Status", "Choice", null, [text, number, date, boolean]);
  const choice = createChoice("ready", status, "Ready", []);
  const calendarDate = Temporal.PlainDate.from("2026-11-13");

  const { upserts } = planFieldValueEdits(
    "item",
    "project",
    [text, number, date, boolean, status],
    [choice],
    [],
    [
      { fieldDefinitionId: text.id, textValue: " trimmed " },
      { fieldDefinitionId: number.id, numberValue: 1.5 },
      { fieldDefinitionId: date.id, dateValue: calendarDate },
      { fieldDefinitionId: boolean.id, boolValue: false },
      { fieldDefinitionId: status.id, choiceId: choice.id },
    ],
  );

  expect(upserts).toMatchObject([
    { itemId: "item", fieldDefinitionId: text.id, textValue: "trimmed", numberValue: null },
    { itemId: "item", fieldDefinitionId: number.id, numberValue: 1.5 },
    { itemId: "item", fieldDefinitionId: date.id, dateValue: calendarDate },
    { itemId: "item", fieldDefinitionId: boolean.id, boolValue: false },
    { itemId: "item", fieldDefinitionId: status.id, choiceId: choice.id },
  ]);
});

it("rejects repeated and unknown fields before producing an edit plan", () => {
  const field = createField("text", "Text", "Text", null, []);
  const input = { fieldDefinitionId: field.id, textValue: "value" };

  expect(() => planFieldValueEdits("item", "project", [field], [], [], [input, input])).toThrow(
    "Each field may appear only once.",
  );
  expect(() =>
    planFieldValueEdits("item", "project", [field], [], [], [{ fieldDefinitionId: "missing" }]),
  ).toThrow("Field was not found.");
});

it("allows re-supplying the same date or clearing a value after its field is archived", () => {
  const field = createField("date", "Date", "Date", null, []);
  const date = "2026-11-13";
  const input = { fieldDefinitionId: field.id, dateValue: Temporal.PlainDate.from(date) };
  const { upserts } = planFieldValueEdits("item", "project", [field], [], [], [input]);
  const archived = archiveField(field);

  const unchanged = planFieldValueEdits("item", "project", [archived], [], upserts, [
    { ...input, dateValue: Temporal.PlainDate.from(date) },
  ]);
  const cleared = planFieldValueEdits("item", "project", [archived], [], upserts, [
    { fieldDefinitionId: field.id, dateValue: null },
  ]);

  expect(unchanged).toEqual({ upserts: [], removals: [] });
  expect(cleared).toEqual({ upserts: [], removals: [field.id] });
});
