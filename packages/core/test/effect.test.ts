import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

describe("The core test runner", () => {
  it.effect("runs an Effect and returns its value", () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed("ready");

      expect(value).toBe("ready");
    }),
  );
});
