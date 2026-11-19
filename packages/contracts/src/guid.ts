import { Schema, SchemaTransformation } from "effect";

const guid = Schema.String.check(Schema.isGUID());
const uppercase = (value: string) => value.toUpperCase();

/** A hyphenated GUID serialized and decoded in uppercase, preserving legacy IDs. */
export const Guid = guid.pipe(
  Schema.decodeTo(guid, SchemaTransformation.transform({ decode: uppercase, encode: uppercase })),
);
