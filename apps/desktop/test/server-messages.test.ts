import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { decodeServerLine, encodeServerCommand } from "../src/server-messages.js";

describe("decodeServerLine", () => {
  it("Decodes a notification and normalizes its item ID", () => {
    const line = JSON.stringify({
      type: "show-notification",
      notification: {
        title: "Call",
        body: "Operations",
        itemId: "019a0000-0000-7000-8000-000000000ccc",
      },
    });

    const message = decodeServerLine(line);

    expect(message).toEqual(
      Option.some({
        type: "show-notification",
        notification: {
          title: "Call",
          body: "Operations",
          itemId: "019A0000-0000-7000-8000-000000000CCC",
        },
      }),
    );
  });

  it("Ignores unknown messages, malformed IDs and oversized lines", () => {
    const lines = [
      "{}",
      JSON.stringify({ type: "open-url", url: "https://example.com" }),
      JSON.stringify({
        type: "show-notification",
        notification: { title: "Call", body: "", itemId: "../../etc" },
      }),
      JSON.stringify({ type: "keep-running-in-tray", enabled: "yes" }),
      JSON.stringify({
        type: "show-notification",
        notification: { title: "x".repeat(70_000), body: "", itemId: null },
      }),
    ];

    const messages = lines.map(decodeServerLine);

    expect(messages.every(Option.isNone)).toBe(true);
  });
});

describe("encodeServerCommand", () => {
  it("Writes one JSON line per command", () => {
    const line = encodeServerCommand({ type: "check-reminders" });

    expect(line).toEqual(Option.some('{"type":"check-reminders"}\n'));
  });

  it("Writes a transfer file grant on the same protocol", () => {
    const grant = {
      type: "transfer-file-grant",
      token: "A".repeat(43),
      path: "/home/user/export.json",
      access: "write",
    } as const;

    const line = encodeServerCommand(grant);

    expect(Option.map(line, (text) => JSON.parse(text) as unknown)).toEqual(Option.some(grant));
  });

  it("Refuses a grant the protocol does not allow", () => {
    const grant = {
      type: "transfer-file-grant",
      token: "short",
      path: "/home/user/export.json",
      access: "write",
    } as const;

    const line = encodeServerCommand(grant);

    expect(line).toEqual(Option.none());
  });
});
