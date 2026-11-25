import { expect, it } from "@effect/vitest";
import { SettingsCatalogue, trayCardSizeCodec } from "../../src/index.js";

it("reads the tray card size ignoring case and surrounding space", () => {
  const read = [" compact ", "FULL"].map((text) => trayCardSizeCodec.parse(text));

  expect(read).toEqual(["Compact", "Full"]);
});

it("writes the size's name", () => {
  const written = trayCardSizeCodec.format("Compact");

  expect(written).toBe("Compact");
});

it("refuses any other text", () => {
  const read = () => SettingsCatalogue.trayCardSize.parse("Large");

  expect(read).toThrow(SyntaxError);
});

it("defaults to full cards that show their items, global only", () => {
  const { trayCardSize, trayCardShowsItems } = SettingsCatalogue;

  expect([trayCardSize.defaultValue, trayCardShowsItems.defaultValue]).toEqual(["Full", true]);
  expect(trayCardSize.projectOverridable || trayCardShowsItems.projectOverridable).toBe(false);
});
