import { expect, it } from "@effect/vitest";
import {
  booleanCodec,
  SettingDefinition,
  SettingsCatalogue,
  SettingsResolver,
} from "../../src/index.js";

const empty = new Map<string, string>();

it("uses defaults with global source when no values are stored", () => {
  const settings = SettingsResolver.resolve(empty, empty);

  expect(settings.autoCompleteParents).toEqual({ value: true, source: "Global" });
  expect(settings.urgencyYellowThreshold).toEqual({ value: 2_592_000_000_000n, source: "Global" });
  expect(settings.urgencyRedThreshold).toEqual({ value: 864_000_000_000n, source: "Global" });
});

it("uses the project override and reports project source", () => {
  const global = new Map([[SettingsCatalogue.autoCompleteParents.key, "false"]]);
  const project = new Map([[SettingsCatalogue.autoCompleteParents.key, "true"]]);

  const settings = SettingsResolver.resolve(global, project);

  expect(settings.autoCompleteParents).toEqual({ value: true, source: "Project" });
});

it("ignores the project value when a definition disallows overrides", () => {
  const definition = new SettingDefinition("globalOnly", false, false, booleanCodec);
  const global = new Map([[definition.key, "true"]]);
  const project = new Map([[definition.key, "false"]]);

  const value = SettingsResolver.resolveValue(definition, global, project);

  expect(value).toEqual({ value: true, source: "Global" });
});

it("identifies the setting in an error for malformed text", () => {
  const boolean = SettingsCatalogue.autoCompleteParents;
  const duration = SettingsCatalogue.urgencyRedThreshold;

  expect(() => boolean.parse("maybe")).toThrow(boolean.key);
  expect(() => duration.parse("tomorrow")).toThrow(duration.key);
});

it("checks threshold ordering and nonnegative red after resolving overrides", () => {
  const global = new Map([
    ["urgencyYellowThreshold", "PT3H"],
    ["urgencyRedThreshold", "PT2H"],
  ]);
  const tooHigh = new Map([["urgencyRedThreshold", "PT4H"]]);
  const negative = new Map([["urgencyRedThreshold", "-PT0.5S"]]);
  const equal = new Map([["urgencyRedThreshold", "PT3H"]]);

  const highSettings = SettingsResolver.resolve(global, tooHigh);
  const negativeSettings = SettingsResolver.resolve(global, negative);
  const equalSettings = SettingsResolver.resolve(global, equal);

  expect(SettingsResolver.hasValidThresholds(highSettings)).toBe(false);
  expect(SettingsResolver.hasValidThresholds(negativeSettings)).toBe(false);
  expect(SettingsResolver.hasValidThresholds(equalSettings)).toBe(true);
});
