import { randomBytes } from "node:crypto";

/** Generate an uppercase UUIDv7 using the operation clock and cryptographic random bits. */
export function newId(now: Temporal.Instant): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now.epochMilliseconds, 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

  const hex = bytes.toString("hex").toUpperCase();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
