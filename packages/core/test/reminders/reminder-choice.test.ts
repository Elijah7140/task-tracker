import { describe, expect, it } from "@effect/vitest";
import {
  MetadataRuleError,
  sameReminderChoice,
  validateReminderChoice,
  type ReminderChoice,
} from "../../src/index.js";

describe("validateReminderChoice", () => {
  it("Accepts Default, None and every listed offset", () => {
    const choices: ReminderChoice[] = [
      { kind: "default" },
      { kind: "none" },
      { kind: "offset", minutes: 0 },
      { kind: "offset", minutes: 10080 },
    ];

    const validated = choices.map(validateReminderChoice);

    expect(validated).toEqual(choices);
  });

  it("Refuses an offset that is not listed", () => {
    const attempt = () => validateReminderChoice({ kind: "offset", minutes: 10 });

    expect(attempt).toThrow(MetadataRuleError);
    expect(attempt).toThrow("Choose one of the listed reminder offsets.");
  });
});

describe("sameReminderChoice", () => {
  it("Compares the kind and the offset", () => {
    const fifteen: ReminderChoice = { kind: "offset", minutes: 15 };

    const results = [
      sameReminderChoice(fifteen, { kind: "offset", minutes: 15 }),
      sameReminderChoice(fifteen, { kind: "offset", minutes: 30 }),
      sameReminderChoice({ kind: "default" }, { kind: "none" }),
    ];

    expect(results).toEqual([true, false, false]);
  });
});
