import { describe, expect, it } from "vitest";
import { NAME_VALIDATION, validatePromptValue } from "../../src/dialogs/name-validation.js";

describe("validatePromptValue", () => {
  it.each([" ", "\t\r\n", "\u00a0", "\u0085", "\u2028\u3000"])(
    "Asks for a name when the value is only .NET white space: %j",
    (value) => {
      const message = validatePromptValue(value, NAME_VALIDATION);

      expect(message).toBe("Enter a name.");
    },
  );

  it.each(["\ufeff", "\u200b"])("Accepts %j, which .NET does not trim", (value) => {
    const message = validatePromptValue(` ${value} `, NAME_VALIDATION);

    expect(message).toBeNull();
  });

  it("Measures the length after trimming .NET white space", () => {
    const name = "a".repeat(300);

    const fits = validatePromptValue(`\u0085${name}\u00a0`, NAME_VALIDATION);
    const tooLong = validatePromptValue(`\ufeff${name}`, NAME_VALIDATION);

    expect(fits).toBeNull();
    expect(tooLong).toBe("Name must be 300 characters or fewer.");
  });
});
