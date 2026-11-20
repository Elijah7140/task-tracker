import { PassThrough } from "node:stream";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, PubSub } from "effect";
import { decodeParentLine, makeParentChannel } from "../../src/desktop/parent-channel.js";

const ITEM_ID = "019a0000-0000-7000-8000-000000000ccc";

/** Collects what the channel writes, one entry per line. */
function captureLines(stream: PassThrough) {
  const lines: string[] = [];
  let buffered = "";
  stream.setEncoding("utf8").on("data", (chunk: string) => {
    buffered += chunk;
    const parts = buffered.split("\n");
    buffered = parts.pop() ?? "";
    lines.push(...parts);
  });
  return lines;
}

const settle = Effect.gen(function* () {
  for (let turn = 0; turn < 20; turn++) {
    yield* Effect.yieldNow;
  }
  yield* Effect.promise(() => new Promise((resolve) => setImmediate(resolve)));
});

describe("decodeParentLine", () => {
  it("Accepts the reminder check command", () => {
    const line = JSON.stringify({ type: "check-reminders" });

    const decoded = decodeParentLine(line);

    expect(decoded).toEqual(Option.some({ type: "check-reminders" }));
  });

  it("Accepts a transfer file grant on the same pipe", () => {
    const grant = {
      type: "transfer-file-grant",
      token: "A".repeat(43),
      path: "/home/user/export.json",
      access: "write",
    };

    const decoded = decodeParentLine(JSON.stringify(grant));

    expect(decoded).toEqual(Option.some(grant));
  });

  it("Ignores malformed, unknown and oversized lines", () => {
    const lines = [
      "not json",
      JSON.stringify({ type: "quit" }),
      JSON.stringify({ type: "check-reminders", padding: "x".repeat(17_000) }),
      JSON.stringify({
        type: "transfer-file-grant",
        token: "short",
        path: "/a.json",
        access: "read",
      }),
    ];

    const decoded = lines.map(decodeParentLine);

    expect(decoded.every(Option.isNone)).toBe(true);
  });
});

describe("makeParentChannel", () => {
  it.live("Holds messages until the readiness line has been written", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const output = new PassThrough();
        const lines = captureLines(output);
        const channel = yield* makeParentChannel(new PassThrough(), output);
        const notification = { title: "Call", body: "Operations", itemId: ITEM_ID };

        yield* channel.send({ type: "show-notification", notification });
        yield* settle;
        const beforeReady = [...lines];
        output.write("readiness\n");
        yield* channel.markReady;
        yield* settle;

        expect(beforeReady).toEqual([]);
        expect(lines[0]).toBe("readiness");
        expect(JSON.parse(lines[1] ?? "")).toEqual({
          type: "show-notification",
          notification: { ...notification, itemId: ITEM_ID.toUpperCase() },
        });
      }),
    ),
  );

  it.live("Delivers valid commands from the launcher to every subscriber and skips the rest", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const input = new PassThrough();
        const channel = yield* makeParentChannel(input, new PassThrough());
        const first = yield* PubSub.subscribe(channel.commands);
        const second = yield* PubSub.subscribe(channel.commands);

        input.write('{"type":"unknown"}\nnoise\n{"type":"check-reminders"}\n');
        const commands = [yield* PubSub.take(first), yield* PubSub.take(second)];

        expect(commands).toEqual([{ type: "check-reminders" }, { type: "check-reminders" }]);
      }),
    ),
  );
});
