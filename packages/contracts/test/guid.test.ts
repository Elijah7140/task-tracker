import { Schema } from "effect";
import { expect, it } from "vitest";
import { Guid } from "../src/guid.js";

it("Normalizes GUIDs on both sides of the wire, including legacy GUIDs", () => {
  const legacyId = "019a0000-0000-0000-0000-000000000AbC";

  const decoded = Schema.decodeUnknownSync(Guid)(legacyId);

  expect(decoded).toBe("019A0000-0000-0000-0000-000000000ABC");
  expect(Schema.encodeSync(Guid)(legacyId)).toBe(decoded);
});

it("Rejects malformed GUIDs", () => {
  expect(() => Schema.decodeUnknownSync(Guid)("019a0000000000000000000000000abc")).toThrow();
});
