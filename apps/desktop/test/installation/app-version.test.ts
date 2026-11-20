import { describe, expect, it } from "vitest";
import { displayVersion } from "../../src/installation/app-version.js";

describe("displayVersion", () => {
  it("Keeps a plain version number", () => {
    const version = displayVersion("0.1.0");

    expect(version).toBe("0.1.0");
  });

  it("Drops build metadata after a plus sign", () => {
    const version = displayVersion("0.2.0+4f1c2ab9d");

    expect(version).toBe("0.2.0");
  });

  it("Keeps a pre-release label", () => {
    const version = displayVersion("0.3.0-beta.1+4f1c2ab9d");

    expect(version).toBe("0.3.0-beta.1");
  });

  it.each([undefined, "", " ", "+4f1c2ab9d", "0.1.0 beta"])(
    "Without usable version metadata %j the number is unknown",
    (metadata) => {
      const version = displayVersion(metadata);

      expect(version).toBe("unknown");
    },
  );
});
