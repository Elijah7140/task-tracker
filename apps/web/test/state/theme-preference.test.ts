import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme } from "../../src/state/theme-preference.js";

describe("resolveTheme", () => {
  it("Follows the system appearance when the preference is system", () => {
    const resolved = resolveTheme("system", true);

    expect(resolved).toBe("dark");
  });

  it("Uses an explicit preference regardless of the system appearance", () => {
    const resolved = resolveTheme("light", true);

    expect(resolved).toBe("light");
  });
});

describe("isThemePreference", () => {
  it("Accepts only the three supported preferences", () => {
    const accepted = ["system", "light", "dark", "sepia", null].map(isThemePreference);

    expect(accepted).toEqual([true, true, true, false, false]);
  });
});
