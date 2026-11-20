import { describe, expect, it } from "vitest";
import { isNewerStableRelease } from "../../src/installation/release-version.js";

describe("isNewerStableRelease", () => {
  it.each([
    ["0.2.0", "0.1.0"],
    ["0.1.1", "0.1.0"],
    ["1.0.0", "0.9.9"],
    ["0.10.0", "0.9.0"],
    ["0.3.0", "0.3.0-beta.1"],
  ])("Offers %s over %s", (candidate, current) => {
    const newer = isNewerStableRelease(candidate, current);

    expect(newer).toBe(true);
  });

  it.each([
    ["0.1.0", "0.1.0"],
    ["0.1.0", "0.2.0"],
    ["0.2.0", "0.3.0-beta.1"],
  ])("Does not offer %s over %s", (candidate, current) => {
    const newer = isNewerStableRelease(candidate, current);

    expect(newer).toBe(false);
  });

  it("Never offers a prerelease, even when it is newer", () => {
    const newer = isNewerStableRelease("0.4.0-rc.1", "0.1.0");

    expect(newer).toBe(false);
  });

  it.each([
    ["v0.2.0", "0.1.0"],
    ["0.2", "0.1.0"],
    ["01.2.0", "0.1.0"],
    ["0.2.0", "unknown"],
  ])("Treats an unparseable version in %s or %s as not newer", (candidate, current) => {
    const newer = isNewerStableRelease(candidate, current);

    expect(newer).toBe(false);
  });
});
