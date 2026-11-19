import { Schema } from "effect";
import { Guid } from "./guid.js";
import { IsoDate } from "./iso-date-time.js";

/** One supplied custom-field edit. Omitted or null typed columns clear the stored value. */
export const FieldValueInput = Schema.Struct({
  fieldDefinitionId: Guid,
  textValue: Schema.optionalKey(Schema.NullOr(Schema.String)),
  numberValue: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  dateValue: Schema.optionalKey(Schema.NullOr(IsoDate)),
  boolValue: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
  choiceId: Schema.optionalKey(Schema.NullOr(Guid)),
});

/** A persisted custom-field value row returned for an item, with ISO dates and uppercase GUIDs. */
export const ItemFieldValue = Schema.Struct({
  itemId: Guid,
  fieldDefinitionId: Guid,
  textValue: Schema.NullOr(Schema.String),
  numberValue: Schema.NullOr(Schema.Finite),
  dateValue: Schema.NullOr(IsoDate),
  boolValue: Schema.NullOr(Schema.Boolean),
  choiceId: Schema.NullOr(Guid),
});
