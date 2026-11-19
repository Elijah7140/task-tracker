import { ticksPerDay } from "../time/duration-ticks.js";
import { booleanCodec } from "./boolean-codec.js";
import { durationCodec } from "./duration-codec.js";
import { SettingDefinition } from "./setting-definition.js";
import { wholeNumberCodec } from "./whole-number-codec.js";

/** The typed definitions of the built-in global settings and project overrides. */
export const SettingsCatalogue = {
  autoCompleteParents: new SettingDefinition("autoCompleteParents", true, true, booleanCodec),
  urgencyYellowThreshold: new SettingDefinition(
    "urgencyYellowThreshold",
    3n * ticksPerDay,
    true,
    durationCodec,
  ),
  urgencyRedThreshold: new SettingDefinition(
    "urgencyRedThreshold",
    ticksPerDay,
    true,
    durationCodec,
  ),
  workspaceCardColumns: new SettingDefinition(
    "workspaceCardColumns",
    4,
    false,
    wholeNumberCodec(1, 8),
  ),
} as const;
