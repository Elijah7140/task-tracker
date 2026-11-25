import { expect, it } from "@effect/vitest";
import { SettingsCatalogue } from "../../src/index.js";

it("shows the Detail on ticket cards by default, as a global setting only", () => {
  const setting = SettingsCatalogue.showTicketDetailOnCards;

  expect(setting.key).toBe("showTicketDetailOnCards");
  expect(setting.defaultValue).toBe(true);
  expect(setting.projectOverridable).toBe(false);
  expect(setting.parse(setting.format(false))).toBe(false);
});
