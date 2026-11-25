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

it("Card columns default to four and ignore project overrides", () => {
  const key = SettingsCatalogue.workspaceCardColumns.key;
  const project = new Map([[key, "2"]]);
  const global = new Map([[key, "5"]]);

  const defaults = SettingsResolver.resolve(empty, empty);
  const resolved = SettingsResolver.resolve(global, project);

  expect(defaults.workspaceCardColumns).toEqual({ value: 4, source: "Global" });
  expect(resolved.workspaceCardColumns).toEqual({ value: 5, source: "Global" });
  expect(SettingsCatalogue.workspaceCardColumns.projectOverridable).toBe(false);
});

it("Workspace layout settings default to scaling, a top add line and side details", () => {
  const { scaleCardColumnsToWindow, addLinePosition, detailsPanelPosition } = SettingsCatalogue;
  const global = new Map([
    [addLinePosition.key, "Bottom"],
    [detailsPanelPosition.key, "Top"],
  ]);

  const scale = SettingsResolver.resolveValue(scaleCardColumnsToWindow, empty, empty);
  const addLine = SettingsResolver.resolveValue(addLinePosition, global, empty);
  const details = SettingsResolver.resolveValue(detailsPanelPosition, global, empty);

  expect(scale).toEqual({ value: true, source: "Global" });
  expect(addLine).toEqual({ value: "Bottom", source: "Global" });
  expect(details).toEqual({ value: "Top", source: "Global" });
  expect(addLinePosition.defaultValue).toBe("Top");
  expect(detailsPanelPosition.defaultValue).toBe("Side");
  expect(
    [scaleCardColumnsToWindow, addLinePosition, detailsPanelPosition].some(
      (definition) => definition.projectOverridable,
    ),
  ).toBe(false);
});

it("Start with system defaults to off and cannot be overridden per project", () => {
  const definition = SettingsCatalogue.startWithSystem;

  const initial = definition.defaultValue;

  expect(initial).toBe(false);
  expect(definition.key).toBe("startWithSystem");
  expect(definition.projectOverridable).toBe(false);
  expect(() => definition.formatOverride(true)).toThrow();
});
